/**
 * materials.js — Hybrid Nano Banana Base64 + Procedural <canvas> PBR Material & Shader Library.
 * Enforces SwiftShader Fill-Rate Law (lightweight ShaderMaterial/MeshBasicMaterial on sky & distant rings,
 * zero full-screen GGX PBR cycloramas), deterministic Base64 Image decode promises (`readyPromise`)
 * for bit-exact multi-worker shard parity, and all 12 Nano Banana campus/plumage textures.
 */

import * as THREE from "../vendor/three.module.js";
import { NANO_TEXTURES } from "../assets/nano_textures.js";
import { GBIKE_COLORS } from "../contract.js";
import { createSeededRNG } from "../rig/ik_solver.js";
import {
  upgradeRoadAndCurbRealism,
  OMNI_V5_ENVIRONMENT_TELEMETRY,
} from "./v5_aaa_environment.js";

export { OMNI_V5_ENVIRONMENT_TELEMETRY };

/**
 * Zero-dependency static BufferGeometry merger (`< 250` WebGL draw-call optimization).
 * Expands indexed geometries via `.toNonIndexed()`, merges `position`, `normal`, `uv`
 * (and optional `color` attribute), and disposes temporary buffers cleanly.
 */
export function mergeStaticGeometries(geometries, includeColors = false, disposeInputs = true) {
  if (!geometries || geometries.length === 0) {
    return new THREE.BufferGeometry();
  }
  const expanded = [];
  let totalVerts = 0;

  for (const src of geometries) {
    if (!src) continue;
    const g = src.index ? src.toNonIndexed() : src;
    if (!g.attributes.normal) {
      g.computeVertexNormals();
    }
    expanded.push({ g, src });
    totalVerts += g.attributes.position.count;
  }

  const posArr = new Float32Array(totalVerts * 3);
  const normArr = new Float32Array(totalVerts * 3);
  const uvArr = new Float32Array(totalVerts * 2);
  const colArr = includeColors ? new Float32Array(totalVerts * 3) : null;

  let vOffset = 0;
  for (const { g, src } of expanded) {
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    const col = includeColors ? g.attributes.color : null;
    const count = pos.count;

    if (
      !pos.isInterleavedBufferAttribute &&
      pos.array instanceof Float32Array &&
      pos.itemSize === 3 &&
      !norm.isInterleavedBufferAttribute &&
      norm.array instanceof Float32Array &&
      norm.itemSize === 3
    ) {
      posArr.set(pos.array.subarray(0, count * 3), vOffset * 3);
      normArr.set(norm.array.subarray(0, count * 3), vOffset * 3);
      if (uv && !uv.isInterleavedBufferAttribute && uv.array instanceof Float32Array && uv.itemSize === 2) {
        uvArr.set(uv.array.subarray(0, count * 2), vOffset * 2);
      }
      if (colArr) {
        if (col && !col.isInterleavedBufferAttribute && col.array instanceof Float32Array && col.itemSize >= 3) {
          if (col.itemSize === 3) {
            colArr.set(col.array.subarray(0, count * 3), vOffset * 3);
          } else {
            for (let i = 0; i < count; i++) {
              const i3 = (vOffset + i) * 3;
              colArr[i3] = col.getX(i);
              colArr[i3 + 1] = col.getY(i);
              colArr[i3 + 2] = col.getZ(i);
            }
          }
        } else {
          colArr.fill(1, vOffset * 3, (vOffset + count) * 3);
        }
      }
    } else {
      for (let i = 0; i < count; i++) {
        const i3 = (vOffset + i) * 3;
        const i2 = (vOffset + i) * 2;
        posArr[i3] = pos.getX(i);
        posArr[i3 + 1] = pos.getY(i);
        posArr[i3 + 2] = pos.getZ(i);

        normArr[i3] = norm.getX(i);
        normArr[i3 + 1] = norm.getY(i);
        normArr[i3 + 2] = norm.getZ(i);

        if (uv) {
          uvArr[i2] = uv.getX(i);
          uvArr[i2 + 1] = uv.getY(i);
        } else {
          uvArr[i2] = 0;
          uvArr[i2 + 1] = 0;
        }

        if (colArr) {
          if (col) {
            colArr[i3] = col.getX(i);
            colArr[i3 + 1] = col.getY(i);
            colArr[i3 + 2] = col.getZ(i);
          } else {
            colArr[i3] = 1;
            colArr[i3 + 1] = 1;
            colArr[i3 + 2] = 1;
          }
        }
      }
    }
    vOffset += count;
    if (g !== src) g.dispose();
    if (disposeInputs) src.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normArr, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
  if (colArr) {
    merged.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
  }
  return merged;
}

/**
 * Compacts static leaf `THREE.Mesh`es sharing the same material inside a rigid bone/group hierarchy
 * into a single merged `BufferGeometry` per material while preserving exact world/local transforms,
 * shadow flags, `logicalSubParts`, and skipping dynamic child groups (`stopGroups`) or deformable meshes (`skipMeshes`).
 */
export function compactRigidGroupMeshes(rootGroup, stopGroups = new Set(), skipMeshes = new Set()) {
  if (!rootGroup) return;
  rootGroup.updateMatrixWorld(true);

  const buckets = new Map();
  function walk(node) {
    for (const child of node.children) {
      if (stopGroups.has(child)) continue;
      if (
        child.isMesh &&
        !child.isInstancedMesh &&
        child.children.length === 0 &&
        !skipMeshes.has(child) &&
        !child.material?.vertexColors
      ) {
        const mat = child.material;
        if (!buckets.has(mat)) buckets.set(mat, []);
        buckets.get(mat).push(child);
      } else if (child.children && child.children.length > 0) {
        walk(child);
      }
    }
  }
  walk(rootGroup);

  for (const [, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const leadIdx = meshes.findIndex((m) => m.parent === rootGroup);
    if (leadIdx > 0) {
      const [directLead] = meshes.splice(leadIdx, 1);
      meshes.unshift(directLead);
    }
    const lead = meshes[0];
    const invLeadWorld = lead.matrixWorld.clone().invert();
    const geoms = [lead.geometry.clone()];
    const toDispose = new Set([lead.geometry]);
    let castShadow = Boolean(lead.castShadow);
    let receiveShadow = Boolean(lead.receiveShadow);
    let totalSubParts = lead.userData?.logicalSubParts || 1;

    for (let k = 1; k < meshes.length; k++) {
      const m = meshes[k];
      toDispose.add(m.geometry);
      const relMat = invLeadWorld.clone().multiply(m.matrixWorld);
      const gClone = m.geometry.clone();
      gClone.applyMatrix4(relMat);
      if (relMat.determinant() < 0) {
        const gNonIdx = gClone.index ? gClone.toNonIndexed() : gClone;
        const pos = gNonIdx.attributes.position;
        const norm = gNonIdx.attributes.normal;
        const uv = gNonIdx.attributes.uv;
        for (let i = 0; i < pos.count; i += 3) {
          for (const attr of [pos, norm, uv]) {
            if (!attr) continue;
            const itemSize = attr.itemSize;
            for (let c = 0; c < itemSize; c++) {
              const tmp = attr.array[(i + 1) * itemSize + c];
              attr.array[(i + 1) * itemSize + c] = attr.array[(i + 2) * itemSize + c];
              attr.array[(i + 2) * itemSize + c] = tmp;
            }
          }
        }
        geoms.push(gNonIdx);
        if (gNonIdx !== gClone) gClone.dispose();
      } else {
        geoms.push(gClone);
      }
      if (m.castShadow) castShadow = true;
      if (m.receiveShadow) receiveShadow = true;
      totalSubParts += m.userData?.logicalSubParts || 1;
      if (m.parent) m.parent.remove(m);
    }

    lead.geometry = mergeStaticGeometries(geoms, false, true);
    lead.castShadow = castShadow;
    lead.receiveShadow = receiveShadow;
    lead.userData = { ...lead.userData, logicalSubParts: totalSubParts };
    for (const oldG of toDispose) {
      oldG.dispose();
    }
  }
}

function parseCssRgbaForNodeShim(style) {
  if (!style || typeof style !== "string") return [128, 128, 128, 255];
  const s = style.trim();
  if (s.startsWith("#")) {
    if (s.length === 7) {
      return [
        parseInt(s.slice(1, 3), 16) || 0,
        parseInt(s.slice(3, 5), 16) || 0,
        parseInt(s.slice(5, 7), 16) || 0,
        255,
      ];
    }
    if (s.length === 4) {
      return [
        (parseInt(s[1], 16) || 0) * 17,
        (parseInt(s[2], 16) || 0) * 17,
        (parseInt(s[3], 16) || 0) * 17,
        255,
      ];
    }
  }
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (m) {
    return [
      Math.max(0, Math.min(255, Math.round(Number(m[1]) || 0))),
      Math.max(0, Math.min(255, Math.round(Number(m[2]) || 0))),
      Math.max(0, Math.min(255, Math.round(Number(m[3]) || 0))),
      m[4] !== undefined ? Math.max(0, Math.min(255, Math.round(Number(m[4]) * 255))) : 255,
    ];
  }
  return [140, 140, 140, 255];
}

function makeHeadlessNodeCanvasShim(w, h) {
  const rgba = new Uint8Array(w * h * 4);
  for (let p = 3; p < rgba.length; p += 4) rgba[p] = 255;

  const makeGradShim = () => {
    const stops = [];
    return {
      __isGrad: true,
      stops,
      addColorStop(offset, color) {
        stops.push({ offset, rgba: parseCssRgbaForNodeShim(color) });
      },
    };
  };

  const resolveStyleRgba = (style) => {
    if (style && style.__isGrad && style.stops.length > 0) {
      return style.stops[Math.floor(style.stops.length * 0.5)].rgba;
    }
    return parseCssRgbaForNodeShim(style);
  };

  let curX = 0;
  let curY = 0;
  const stateStack = [];
  const ctx = {
    fillStyle: "#808080",
    strokeStyle: "#808080",
    globalAlpha: 1.0,
    globalCompositeOperation: "source-over",
    lineWidth: 1.0,
    lineCap: "butt",
    lineJoin: "miter",
    font: "12px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    shadowColor: "rgba(0,0,0,0)",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save() {
      stateStack.push({
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        globalAlpha: this.globalAlpha,
        lineWidth: this.lineWidth,
      });
    },
    restore() {
      const prev = stateStack.pop();
      if (prev) Object.assign(this, prev);
    },
    translate() {},
    rotate() {},
    scale() {},
    setTransform() {},
    clearRect(x, y, rw, rh) {
      const x0 = Math.max(0, Math.floor(x));
      const y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(w, Math.ceil(x + rw));
      const y1 = Math.min(h, Math.ceil(y + rh));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const p = (py * w + px) * 4;
          rgba[p] = 0;
          rgba[p + 1] = 0;
          rgba[p + 2] = 0;
          rgba[p + 3] = 0;
        }
      }
    },
    fillRect(x, y, rw, rh) {
      const [cr, cg, cb, ca] = resolveStyleRgba(this.fillStyle);
      const a = Math.max(0, Math.min(1, (ca / 255) * this.globalAlpha));
      const x0 = Math.max(0, Math.floor(x));
      const y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(w, Math.ceil(x + rw));
      const y1 = Math.min(h, Math.ceil(y + rh));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const p = (py * w + px) * 4;
          rgba[p] = Math.round(rgba[p] * (1 - a) + cr * a);
          rgba[p + 1] = Math.round(rgba[p + 1] * (1 - a) + cg * a);
          rgba[p + 2] = Math.round(rgba[p + 2] * (1 - a) + cb * a);
          rgba[p + 3] = Math.max(rgba[p + 3], Math.round(a * 255));
        }
      }
    },
    strokeRect() {},
    beginPath() {},
    closePath() {},
    moveTo(x, y) {
      curX = x;
      curY = y;
    },
    lineTo(x, y) {
      curX = x;
      curY = y;
    },
    bezierCurveTo(_x1, _y1, _x2, _y2, x, y) {
      curX = x;
      curY = y;
    },
    quadraticCurveTo(_cx, _cy, x, y) {
      curX = x;
      curY = y;
    },
    arc(x, y) {
      curX = x;
      curY = y;
    },
    ellipse(x, y) {
      curX = x;
      curY = y;
    },
    rect(x, y, rw, rh) {
      this.fillRect(x, y, rw, rh);
    },
    fill() {
      const [cr, cg, cb] = resolveStyleRgba(this.fillStyle);
      const px = Math.max(0, Math.min(w - 1, Math.round(curX)));
      const py = Math.max(0, Math.min(h - 1, Math.round(curY)));
      const p = (py * w + px) * 4;
      rgba[p] = cr;
      rgba[p + 1] = cg;
      rgba[p + 2] = cb;
      rgba[p + 3] = 255;
    },
    stroke() {},
    clip() {},
    fillText() {},
    strokeText() {},
    measureText(t) {
      return { width: String(t || "").length * 8 };
    },
    createLinearGradient() {
      return makeGradShim();
    },
    createRadialGradient() {
      return makeGradShim();
    },
    createImageData(iw, ih) {
      return { width: iw, height: ih, data: new Uint8ClampedArray(iw * ih * 4) };
    },
    getImageData(sx, sy, sw, sh) {
      const out = new Uint8ClampedArray(sw * sh * 4);
      for (let py = 0; py < sh; py++) {
        const srcY = Math.max(0, Math.min(h - 1, sy + py));
        for (let px = 0; px < sw; px++) {
          const srcX = Math.max(0, Math.min(w - 1, sx + px));
          const sp = (srcY * w + srcX) * 4;
          const dp = (py * sw + px) * 4;
          out[dp] = rgba[sp];
          out[dp + 1] = rgba[sp + 1];
          out[dp + 2] = rgba[sp + 2];
          out[dp + 3] = rgba[sp + 3];
        }
      }
      return { width: sw, height: sh, data: out };
    },
    putImageData(img, dx = 0, dy = 0) {
      if (!img || !img.data) return;
      const iw = img.width || w;
      const ih = img.height || h;
      if (dx === 0 && dy === 0 && iw === w && ih === h) {
        rgba.set(img.data.subarray(0, rgba.length));
        return;
      }
      for (let py = 0; py < ih; py++) {
        const ty = dy + py;
        if (ty < 0 || ty >= h) continue;
        for (let px = 0; px < iw; px++) {
          const tx = dx + px;
          if (tx < 0 || tx >= w) continue;
          const sp = (py * iw + px) * 4;
          const dp = (ty * w + tx) * 4;
          rgba[dp] = img.data[sp];
          rgba[dp + 1] = img.data[sp + 1];
          rgba[dp + 2] = img.data[sp + 2];
          rgba[dp + 3] = img.data[sp + 3];
        }
      }
    },
    drawImage(src, dx = 0, dy = 0, dw = w, dh = h) {
      if (src && src.__rgba && src.width && src.height) {
        for (let py = 0; py < dh; py++) {
          const ty = Math.floor(dy + py);
          if (ty < 0 || ty >= h) continue;
          const sy = Math.min(src.height - 1, Math.floor((py / Math.max(1, dh)) * src.height));
          for (let px = 0; px < dw; px++) {
            const tx = Math.floor(dx + px);
            if (tx < 0 || tx >= w) continue;
            const sx = Math.min(src.width - 1, Math.floor((px / Math.max(1, dw)) * src.width));
            const sp = (sy * src.width + sx) * 4;
            const dp = (ty * w + tx) * 4;
            rgba[dp] = src.__rgba[sp];
            rgba[dp + 1] = src.__rgba[sp + 1];
            rgba[dp + 2] = src.__rgba[sp + 2];
            rgba[dp + 3] = src.__rgba[sp + 3];
          }
        }
      }
    },
  };

  return {
    __isHeadlessShim: true,
    __rgba: rgba,
    width: w,
    height: h,
    getContext() {
      return ctx;
    },
  };
}

function makeCanvas(w, h) {
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return makeHeadlessNodeCanvasShim(w, h);
}

function finalizeTexture(
  canvas,
  { repeatX = 1, repeatY = 1, srgb = true, anisotropy = 8, clamp = false } = {}
) {
  let tex;
  if (canvas && canvas.__isHeadlessShim) {
    tex = new THREE.DataTexture(canvas.__rgba, canvas.width, canvas.height, THREE.RGBAFormat);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
  } else {
    tex = new THREE.CanvasTexture(canvas);
  }
  tex.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (!clamp) {
    tex.repeat.set(repeatX, repeatY);
  }
  tex.anisotropy = anisotropy;
  if (srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Initializes a CanvasTexture immediately with a rich procedural fallback, then awaits
 * the embedded Base64 Nano Banana texture decode deterministically before Frame 0 capture.
 */
function loadHybridNanoTexture(
  dataUri,
  fallbackDrawFn,
  decodePromises,
  { repeatX = 4, repeatY = 4, anisotropy = 8, postOverlayFn = null } = {}
) {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext("2d");
  fallbackDrawFn(ctx, 512, 512);
  if (postOverlayFn) postOverlayFn(ctx, 512, 512);
  const tex = finalizeTexture(canvas, { repeatX, repeatY, srgb: true, anisotropy });

  if (typeof Image !== "undefined" && dataUri) {
    const p = new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve(tex);
      };
      const applyDecoded = () => {
        try {
          if (img.naturalWidth > 0) {
            ctx.drawImage(img, 0, 0, 512, 512);
            if (postOverlayFn) postOverlayFn(ctx, 512, 512);
            tex.needsUpdate = true;
          }
        } catch (_err) {
          // Keep procedural fallback if sandbox blocks drawImage
        }
        done();
      };
      img.onload = () => {
        if (typeof img.decode === "function") {
          img.decode().then(applyDecoded, applyDecoded);
        } else {
          applyDecoded();
        }
      };
      img.onerror = () => done();
      img.src = dataUri;
    });
    decodePromises.push(p);
  }
  return tex;
}

function drawFeatherFallback(dCtx, w, h) {
  const rng = createSeededRNG(0x11a7e1);
  dCtx.fillStyle = "#faf8f2";
  dCtx.fillRect(0, 0, w, h);
  const rows = 14;
  const cols = 10;
  const cellW = w / cols;
  const cellH = h / rows;
  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const cx = (c + (r % 2) * 0.5) * cellW;
      const cy = r * cellH;
      const shade = 246 + Math.floor((rng() - 0.5) * 8);
      dCtx.fillStyle = `rgb(${shade}, ${shade - 2}, ${shade - 6})`;
      dCtx.beginPath();
      dCtx.ellipse(cx, cy, cellW * 0.56, cellH * 0.72, 0, 0, Math.PI * 2);
      dCtx.fill();
      dCtx.strokeStyle = "rgba(212, 206, 194, 0.34)";
      dCtx.lineWidth = 1.3;
      dCtx.stroke();
    }
  }
}

function buildFeatherBumpMap() {
  const bump = makeCanvas(512, 512);
  const bCtx = bump.getContext("2d");
  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, 512, 512);

  const rows = 14;
  const cols = 10;
  const cellW = 512 / cols;
  const cellH = 512 / rows;

  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const cx = (c + (r % 2) * 0.5) * cellW;
      const cy = r * cellH;
      const bGrad = bCtx.createRadialGradient(cx, cy - cellH * 0.15, 2, cx, cy, cellW * 0.65);
      bGrad.addColorStop(0, "#dcdcdc");
      bGrad.addColorStop(0.78, "#8c8c8c");
      bGrad.addColorStop(1, "#4a4a4a");
      bCtx.fillStyle = bGrad;
      bCtx.beginPath();
      bCtx.ellipse(cx, cy, cellW * 0.56, cellH * 0.72, 0, 0, Math.PI * 2);
      bCtx.fill();

      bCtx.strokeStyle = "rgba(235,235,235,0.30)";
      bCtx.lineWidth = 1;
      bCtx.beginPath();
      bCtx.moveTo(cx, cy - cellH * 0.5);
      bCtx.lineTo(cx, cy + cellH * 0.55);
      bCtx.stroke();
    }
  }
  return finalizeTexture(bump, { repeatX: 2, repeatY: 2, srgb: false });
}

function buildBeakAndPouchMaps() {
  const rng = createSeededRNG(0xbea401);
  const pouchBump = makeCanvas(256, 256);
  const pCtx = pouchBump.getContext("2d");
  pCtx.fillStyle = "#808080";
  pCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 32; i++) {
    const x = (i / 32) * 256;
    const g = pCtx.createLinearGradient(x, 0, x + 8, 0);
    g.addColorStop(0, "#505050");
    g.addColorStop(0.5, "#d6d6d6");
    g.addColorStop(1, "#505050");
    pCtx.fillStyle = g;
    pCtx.fillRect(x, 0, 8, 256);
  }
  for (let i = 0; i < 450; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    pCtx.fillStyle = rng() > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
    pCtx.fillRect(x, y, 2, 6);
  }

  return {
    pouchBump: finalizeTexture(pouchBump, { repeatX: 2, repeatY: 1, srgb: false }),
  };
}

function drawConcreteFallback(dCtx, w, h) {
  const rng = createSeededRNG(0x5ca1e2);
  dCtx.fillStyle = "#d9d3c7";
  dCtx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1050; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const sz = 1.6 + rng() * 3.0;
    const v = 198 + Math.floor((rng() - 0.5) * 32);
    dCtx.fillStyle = `rgba(${v + 6}, ${v + 2}, ${v - 5}, 0.42)`;
    dCtx.fillRect(x, y, sz, sz);
  }
  dCtx.strokeStyle = "rgba(120, 114, 104, 0.44)";
  dCtx.lineWidth = 2.5;
  dCtx.beginPath();
  dCtx.moveTo(0, h * 0.5);
  dCtx.lineTo(w, h * 0.5);
  dCtx.moveTo(w * 0.5, 0);
  dCtx.lineTo(w * 0.5, h);
  dCtx.stroke();
}

function buildConcreteBump() {
  const rng = createSeededRNG(0x5ca1e3);
  const bump = makeCanvas(512, 512);
  const bCtx = bump.getContext("2d");
  bCtx.fillStyle = "#848484";
  bCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1050; i++) {
    const x = rng() * 512;
    const y = rng() * 512;
    const bv = 110 + Math.floor(rng() * 45);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x, y, 2.8, 2.8);
  }
  bCtx.strokeStyle = "#343434";
  bCtx.lineWidth = 3;
  bCtx.beginPath();
  bCtx.moveTo(0, 256);
  bCtx.lineTo(512, 256);
  bCtx.moveTo(256, 0);
  bCtx.lineTo(256, 512);
  bCtx.stroke();
  return finalizeTexture(bump, { repeatX: 1.25, repeatY: 1.25, srgb: false });
}

function drawBrickFallback(ctx, w, h) {
  const rng = createSeededRNG(0xb41c09);
  // V6 Architectural Warm Grey-Buff Limestone & Sierra Granite Running-Bond Pavers (#8F8578..#A39889)
  ctx.fillStyle = "#5d574f";
  ctx.fillRect(0, 0, w, h);
  const rows = 12;
  const cols = 6;
  const bw = w / cols;
  const bh = h / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + offset;
      const y = r * bh;
      const t = rng();
      const red = Math.round(143 + t * 20 + (rng() - 0.5) * 6);
      const grn = Math.round(133 + t * 19 + (rng() - 0.5) * 6);
      const blu = Math.round(120 + t * 17 + (rng() - 0.5) * 5);
      ctx.fillStyle = `rgb(${red}, ${grn}, ${blu})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
}

function buildBrickBump() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#343434";
  ctx.fillRect(0, 0, 512, 512);
  const rows = 16;
  const cols = 8;
  const bw = 512 / cols;
  const bh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let c = -1; c <= cols; c++) {
      ctx.fillStyle = "#c8c8c8";
      ctx.fillRect(c * bw + offset + 2.5, r * bh + 2.5, bw - 5, bh - 5);
    }
  }
  return finalizeTexture(c, { repeatX: 1.25, repeatY: 1.25, srgb: false });
}

function drawMulchFallback(ctx, w, h) {
  const rng = createSeededRNG(0x6b4f3a);
  ctx.fillStyle = "#5c402c";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 950; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const shade = rng();
    ctx.fillStyle = shade > 0.55 ? "#7a563c" : shade > 0.25 ? "#4a3221" : "#8c6548";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng() * Math.PI);
    ctx.fillRect(-5, -2, 10 + rng() * 7, 3.6);
    ctx.restore();
  }
}

function drawCedarFallback(ctx, w, h) {
  const rng = createSeededRNG(0x7ed00d);
  ctx.fillStyle = "#a86e40";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 110; i++) {
    const x = (i / 110) * w;
    const rw = 3 + rng() * 7;
    const shade = rng();
    ctx.fillStyle = shade > 0.5 ? "rgba(196,136,84,0.45)" : "rgba(112,68,38,0.42)";
    ctx.fillRect(x, 0, rw, h);
  }
}

function buildRedwoodBump() {
  const rng = createSeededRNG(0x7ed00e);
  const c = makeCanvas(256, 512);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#787878";
  ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 110; i++) {
    const x = rng() * 256;
    ctx.fillStyle = rng() > 0.5 ? "#d0d0d0" : "#262626";
    ctx.fillRect(x, 0, 2 + rng() * 4, 512);
  }
  return finalizeTexture(c, { repeatX: 2, repeatY: 4, srgb: false });
}

function drawBridgePlanksFallback(dCtx, w, h) {
  const rng = createSeededRNG(0x91a4c5);
  dCtx.fillStyle = "#3a2d23";
  dCtx.fillRect(0, 0, w, h);
  const planks = 8;
  const ph = h / planks;
  for (let p = 0; p < planks; p++) {
    const y = p * ph;
    const baseR = 128 + Math.floor((rng() - 0.5) * 26);
    const baseG = 102 + Math.floor((rng() - 0.5) * 20);
    const baseB = 78 + Math.floor((rng() - 0.5) * 16);
    dCtx.fillStyle = `rgb(${baseR}, ${baseG}, ${baseB})`;
    dCtx.fillRect(0, y + 3, w, ph - 5);
    for (let g = 0; g < 26; g++) {
      const gy = y + 4 + rng() * (ph - 8);
      dCtx.fillStyle = rng() > 0.5 ? "rgba(65,48,35,0.28)" : "rgba(172,144,116,0.22)";
      dCtx.fillRect(0, gy, w, 1.5);
    }
  }
}

function buildWoodPlankBump() {
  const rng = createSeededRNG(0x91a4c6);
  const bump = makeCanvas(512, 512);
  const bCtx = bump.getContext("2d");
  bCtx.fillStyle = "#202020";
  bCtx.fillRect(0, 0, 512, 512);
  const planks = 8;
  const ph = 512 / planks;
  for (let p = 0; p < planks; p++) {
    const y = p * ph;
    bCtx.fillStyle = "#bcbcbc";
    bCtx.fillRect(0, y + 3, 512, ph - 5);
    for (let g = 0; g < 24; g++) {
      const gy = y + 4 + rng() * (ph - 8);
      bCtx.fillStyle = rng() > 0.5 ? "rgba(85,85,85,0.4)" : "rgba(215,215,215,0.35)";
      bCtx.fillRect(0, gy, 512, 1.5);
    }
  }
  return finalizeTexture(bump, { repeatX: 2, repeatY: 16, srgb: false });
}

function drawScallopFallback(dCtx, w, h) {
  dCtx.fillStyle = "#edf1f5";
  dCtx.fillRect(0, 0, w, h);
  const cols = 8;
  const rows = 8;
  const cw = w / cols;
  const ch = h / rows;
  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const cx = (c + (r % 2) * 0.5) * cw;
      const cy = r * ch;
      const grad = dCtx.createLinearGradient(cx, cy - ch * 0.5, cx, cy + ch * 0.5);
      grad.addColorStop(0, "#f8fafc");
      grad.addColorStop(0.85, "#dde4ec");
      grad.addColorStop(1, "#b4bfcc");
      dCtx.fillStyle = grad;
      dCtx.beginPath();
      dCtx.moveTo(cx, cy - ch * 0.55);
      dCtx.quadraticCurveTo(cx + cw * 0.55, cy, cx, cy + ch * 0.55);
      dCtx.quadraticCurveTo(cx - cw * 0.55, cy, cx, cy - ch * 0.55);
      dCtx.closePath();
      dCtx.fill();
      dCtx.strokeStyle = "rgba(88, 98, 112, 0.50)";
      dCtx.lineWidth = 2.0;
      dCtx.stroke();
    }
  }
}

function buildScallopShellBump() {
  const bump = makeCanvas(512, 512);
  const bCtx = bump.getContext("2d");
  bCtx.fillStyle = "#bcbcbc";
  bCtx.fillRect(0, 0, 512, 512);
  const cols = 8;
  const rows = 8;
  const cw = 512 / cols;
  const ch = 512 / rows;
  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const cx = (c + (r % 2) * 0.5) * cw;
      const cy = r * ch;
      bCtx.beginPath();
      bCtx.moveTo(cx, cy - ch * 0.55);
      bCtx.quadraticCurveTo(cx + cw * 0.55, cy, cx, cy + ch * 0.55);
      bCtx.quadraticCurveTo(cx - cw * 0.55, cy, cx, cy - ch * 0.55);
      bCtx.closePath();
      bCtx.strokeStyle = "#363636";
      bCtx.lineWidth = 3.0;
      bCtx.stroke();
    }
  }
  return finalizeTexture(bump, { repeatX: 5, repeatY: 3, srgb: false });
}

function drawGrassFallback(ctx, w, h) {
  const rng = createSeededRNG(0x64a551);
  ctx.fillStyle = "#5c9642";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1150; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const g = 128 + Math.floor((rng() - 0.5) * 40);
    const r = Math.floor(g * 0.62);
    const b = Math.floor(g * 0.36);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y, 2.8, 5.2);
  }
}

function drawFoliageFallback(ctx, w, h) {
  const rng = createSeededRNG(0x4f913a);
  ctx.fillStyle = "#5a8c44";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 680; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const g = 124 + Math.floor((rng() - 0.5) * 48);
    ctx.fillStyle = `rgba(${Math.floor(g * 0.64)}, ${g}, ${Math.floor(g * 0.42)}, 0.78)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 7.5 + rng() * 9.5, 3.8 + rng() * 4.8, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCurtainGlassFallback(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, "#7cb2dc");
  grad.addColorStop(0.45, "#4c7fa3");
  grad.addColorStop(0.50, "#334756");
  grad.addColorStop(0.88, "#6a99b8");
  grad.addColorStop(1.0, "#384b59");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function overlayCurtainGlassMullions(ctx, w, h) {
  // Subtle warm sunlit interior ceiling bands + crisp anodized architectural mullions
  // Ensures zero pitch-black buildings from any angle!
  const skyWash = ctx.createLinearGradient(0, 0, 0, h);
  skyWash.addColorStop(0.0, "rgba(186, 224, 255, 0.28)");
  skyWash.addColorStop(0.42, "rgba(255, 244, 214, 0.16)");
  skyWash.addColorStop(0.52, "rgba(38, 54, 68, 0.34)");
  skyWash.addColorStop(0.92, "rgba(255, 240, 205, 0.18)");
  skyWash.addColorStop(1.0, "rgba(34, 48, 62, 0.36)");
  ctx.fillStyle = skyWash;
  ctx.fillRect(0, 0, w, h);

  // Spandrel slab bands & vertical mullions
  ctx.fillStyle = "rgba(44, 58, 72, 0.68)";
  ctx.fillRect(0, Math.floor(h * 0.48), w, 14);
  ctx.fillRect(0, h - 14, w, 14);
  const cols = 6;
  for (let i = 0; i <= cols; i++) {
    const x = Math.round((i / cols) * w);
    ctx.fillRect(x - 3, 0, 6, h);
  }
}

/**
 * Classic Red & Pure-White Swirled Candy Lollipop Map for Clip 3 Android Lawn.
 */
function buildLollipopSpiralMap() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext("2d");
  const cx = 256;
  const cy = 256;
  const imgData = ctx.createImageData(512, 512);
  const data = imgData.data;

  const red = [234, 67, 53];
  const creamWhite = [255, 250, 245];

  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const dx = (x - cx) / 256;
      const dy = (y - cy) / 256;
      const r = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);
      // 4-arm Archimedes candy swirl
      const wave = Math.sin(theta * 3.0 + r * 14.0);
      const t = Math.max(0, Math.min(1, 0.5 + wave * 4.5));
      const p = (y * 512 + x) * 4;
      data[p] = Math.round(creamWhite[0] + (red[0] - creamWhite[0]) * t);
      data[p + 1] = Math.round(creamWhite[1] + (red[1] - creamWhite[1]) * t);
      data[p + 2] = Math.round(creamWhite[2] + (red[2] - creamWhite[2]) * t);
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return finalizeTexture(c, { srgb: true, anisotropy: 8, clamp: true });
}

/**
 * Embossed Dark-Chocolate Wafer Biscuit Map + Bump (eliminates plain brown crate look on Ice Cream Sandwich!).
 */
function buildIceCreamWaferMaps() {
  const diff = makeCanvas(512, 512);
  const dCtx = diff.getContext("2d");
  const bump = makeCanvas(512, 512);
  const bCtx = bump.getContext("2d");

  dCtx.fillStyle = "#3b2215";
  dCtx.fillRect(0, 0, 512, 512);
  bCtx.fillStyle = "#a8a8a8";
  bCtx.fillRect(0, 0, 512, 512);

  // Embossed biscuit frame border
  dCtx.strokeStyle = "#523120";
  dCtx.lineWidth = 18;
  dCtx.strokeRect(18, 18, 476, 476);
  bCtx.strokeStyle = "#e0e0e0";
  bCtx.lineWidth = 16;
  bCtx.strokeRect(18, 18, 476, 476);

  // Classic Ice Cream Sandwich circular docker dimple grid (5 x 8)
  const cols = 5;
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 68 + (c / (cols - 1)) * 376;
      const y = 58 + (r / (rows - 1)) * 396;
      dCtx.fillStyle = "#201109";
      dCtx.beginPath();
      dCtx.arc(x, y, 12, 0, Math.PI * 2);
      dCtx.fill();
      dCtx.strokeStyle = "#593724";
      dCtx.lineWidth = 2.5;
      dCtx.stroke();

      const g = bCtx.createRadialGradient(x, y, 2, x, y, 15);
      g.addColorStop(0, "#181818");
      g.addColorStop(0.75, "#555555");
      g.addColorStop(1, "#c8c8c8");
      bCtx.fillStyle = g;
      bCtx.beginPath();
      bCtx.arc(x, y, 15, 0, Math.PI * 2);
      bCtx.fill();
    }
  }

  return {
    map: finalizeTexture(diff, { srgb: true, anisotropy: 8, clamp: true }),
    bumpMap: finalizeTexture(bump, { srgb: false, anisotropy: 8, clamp: true }),
  };
}

/**
 * 1024x256 SRGBColorSpace Anisotropy-16 Blue Chain Fender Texture (`#4285F4` + Crisp Pure-White `"Google"`).
 * Zero `....` dots prefix, zero `Gbike` text, zero UV stretching (`4.0 : 1.0` exact physical aspect match).
 */
function buildChainguardGraphicTexture(decodePromises = null) {
  const c = makeCanvas(1024, 256);
  const ctx = c.getContext("2d");

  const paintChainguard = () => {
    ctx.fillStyle = GBIKE_COLORS.forkBlue; // #4285F4
    ctx.fillRect(0, 0, 1024, 256);

    // Subtle cylindrical top highlight & bottom edge contour shading
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, "rgba(255, 255, 255, 0.20)");
    grad.addColorStop(0.28, "rgba(255, 255, 255, 0.0)");
    grad.addColorStop(0.78, "rgba(0, 0, 0, 0.0)");
    grad.addColorStop(1.0, "rgba(10, 28, 72, 0.22)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 256);

    // Crisp, bold, pure-white (#FFFFFF) geometric sans-serif "Google" centered along the straight chainguard wing!
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = '700 82px "Space Grotesk", Inter, system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Wing spans u in [0.05 .. 0.67] (vz in [+0.49m .. +0.15m]); centered cleanly at (375, 126)
    ctx.fillText("Google", 375, 126);
    ctx.restore();
  };

  paintChainguard();
  const tex = finalizeTexture(c, { srgb: true, anisotropy: 16, clamp: true });

  if (
    decodePromises &&
    typeof document !== "undefined" &&
    document.fonts &&
    typeof document.fonts.load === "function"
  ) {
    decodePromises.push(
      document.fonts
        .load('700 82px "Space Grotesk"')
        .then(() => {
          paintChainguard();
          tex.needsUpdate = true;
        })
        .catch(() => {})
    );
  }

  return tex;
}

/**
 * Transparent RGBA `"Google"` Wordmark Decal Texture (`1024x256`) for `Drivetrain X-Ray` Mode,
 * keeping `"Google"` razor-sharp (`opacity: 0.90`) over the `0.22` translucent cutaway chainguard shell.
 */
function buildChainguardWordmarkAlphaTexture(decodePromises = null) {
  const c = makeCanvas(1024, 256);
  const ctx = c.getContext("2d");

  const paintWordmark = () => {
    ctx.clearRect(0, 0, 1024, 256);
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(15, 23, 42, 0.45)";
    ctx.shadowBlur = 4;
    ctx.font = '700 82px "Space Grotesk", Inter, system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Google", 375, 126);
    ctx.restore();
  };

  paintWordmark();
  const tex = finalizeTexture(c, { srgb: true, anisotropy: 16, clamp: true });

  if (
    decodePromises &&
    typeof document !== "undefined" &&
    document.fonts &&
    typeof document.fonts.load === "function"
  ) {
    decodePromises.push(
      document.fonts
        .load('700 82px "Space Grotesk"')
        .then(() => {
          paintWordmark();
          tex.needsUpdate = true;
        })
        .catch(() => {})
    );
  }

  return tex;
}

function brightenSunlitGrassOverlay(ctx, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = "rgba(86, 152, 48, 0.42)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Classic Bright-Red (`#EA4335`) Scarf with Crisp Pure-White (`#FFFFFF`) Polka Dots & Woven Knit Grain.
 */
function buildScarfPolkaDotTexture() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#EA4335";
  ctx.fillRect(0, 0, 512, 512);

  // Subtle knit rib texture
  ctx.strokeStyle = "rgba(150, 24, 18, 0.16)";
  ctx.lineWidth = 2;
  for (let y = 0; y < 512; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Crisp staggered pure-white polka dots
  const rows = 6;
  const cols = 6;
  const dx = 512 / cols;
  const dy = 512 / rows;
  ctx.fillStyle = "#FFFFFF";
  for (let r = -1; r <= rows; r++) {
    for (let col = -1; col <= cols; col++) {
      const cx = (col + (r % 2) * 0.5) * dx + dx * 0.25;
      const cy = r * dy + dy * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 15.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finalizeTexture(c, { repeatX: 2, repeatY: 1, srgb: true, anisotropy: 8 });
}

/**
 * Scored Golden French Baguette Crust Texture & Iridescent Silver-Blue Mackerel Fish Texture for Basket Props.
 */
function buildBaguetteTexture() {
  const c = makeCanvas(512, 256);
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "#cc7a29");
  grad.addColorStop(0.5, "#e29542");
  grad.addColorStop(1.0, "#b8681e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Diagonal cream-wheat baker's slashes (grignes)
  for (let i = 0; i < 5; i++) {
    const cx = 86 + i * 86;
    ctx.save();
    ctx.translate(cx, 128);
    ctx.rotate(-0.48);
    ctx.fillStyle = "#f7e4b4";
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9e5012";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }
  return finalizeTexture(c, { srgb: true, anisotropy: 8, clamp: true });
}

function buildMackerelTexture() {
  const c = makeCanvas(512, 256);
  const ctx = c.getContext("2d");
  // Dorsal deep Atlantic blue-teal -> iridescent silver flank -> pearlescent white belly
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0.0, "#1f4766");
  grad.addColorStop(0.38, "#5682a3");
  grad.addColorStop(0.68, "#c8dae8");
  grad.addColorStop(1.0, "#f1f6fa");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Classic wavy dark-blue mackerel tiger bars along dorsal half
  ctx.strokeStyle = "rgba(18, 42, 66, 0.72)";
  ctx.lineWidth = 5;
  for (let y = 12; y < 248; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(95, y + 8, 195, y - 3);
    ctx.stroke();
  }
  return finalizeTexture(c, { srgb: true, anisotropy: 8, clamp: true });
}

function buildContactShadowTexture() {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 124);
  grad.addColorStop(0.0, "rgba(18, 24, 34, 0.58)");
  grad.addColorStop(0.45, "rgba(18, 24, 34, 0.30)");
  grad.addColorStop(0.78, "rgba(18, 24, 34, 0.08)");
  grad.addColorStop(1.0, "rgba(18, 24, 34, 0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return finalizeTexture(c, { srgb: true, anisotropy: 4, clamp: true });
}

/**
 * Lightweight Analytical Sky Dome ShaderMaterial calibrated to V6 Omni 1.5 Look Bible
 * (`#8FB2CE` cool California zenith, `#DCE5EC` horizon haze, `#EAD7B7` / `#FFD596` 4:30 PM sun along `[-0.62, 0.34, -0.71]`).
 * SwiftShader Fill-Rate Compliant & 100% NaN-guarded (`safeNorm3` + `pow(max(..., 1e-5), ...)`).
 */
export function createSkyDomeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenithColor: { value: new THREE.Color("#8FB2CE") },
      uHorizonColor: { value: new THREE.Color("#DCE5EC") },
      uGlowColor: { value: new THREE.Color("#EAD7B7") },
      uSunDir: { value: new THREE.Vector3(-0.62, 0.34, -0.71).normalize() },
      uSunsetMix: { value: 0.30 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      vec3 safeNorm3(vec3 v) {
        float l2 = dot(v, v);
        return l2 > 1e-8 ? v * inversesqrt(l2) : vec3(0.0, 1.0, 0.0);
      }
      void main() {
        vDir = safeNorm3(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uGlowColor;
      uniform vec3 uSunDir;
      uniform float uSunsetMix;
      varying vec3 vDir;

      vec3 safeNorm3(vec3 v) {
        float l2 = dot(v, v);
        return l2 > 1e-8 ? v * inversesqrt(l2) : vec3(0.0, 1.0, 0.0);
      }

      void main() {
        vec3 d = safeNorm3(vDir);
        vec3 sunDir = safeNorm3(uSunDir);
        float h = clamp(d.y * 0.92 + 0.08, 0.0, 1.0);
        float curve = pow(max(h, 1e-5), 0.56);
        vec3 sky = mix(uHorizonColor, uZenithColor, curve);

        float sunAmt = max(dot(d, sunDir), 1e-5);
        float halo = pow(max(sunAmt, 1e-5), 5.5) * (0.28 + 0.32 * uSunsetMix);
        float corona = pow(max(sunAmt, 1e-5), 26.0) * (0.34 + 0.34 * uSunsetMix);
        float disc = smoothstep(0.9968, 0.9995, sunAmt);
        vec3 warmGlow = mix(uGlowColor, vec3(1.0, 0.835, 0.588), uSunsetMix * 0.45);
        sky = mix(sky, warmGlow, clamp(halo + corona * 0.65, 0.0, 0.78));
        sky = mix(sky, vec3(1.0, 0.975, 0.91), disc * 0.90);

        float horizonBand = exp(-abs(d.y) * 9.5) * (0.18 + 0.22 * uSunsetMix);
        sky = mix(sky, warmGlow, clamp(horizonBand, 0.0, 0.44));

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
}

let _cachedWaterRippleNormalTex = null;

/**
 * Deterministic `512x512` non-periodic multi-octave isotropic wind-ripple normal map (`+X, +Y, +Z` tangent space)
 * built from domain-warped `sampleBilinearTile` value noise (ZERO periodic diagonal `Math.sin` stripes!).
 */
function getWaterRippleNormalTexture() {
  if (_cachedWaterRippleNormalTex) return _cachedWaterRippleNormalTex;
  const size = 512;
  const nGridA = buildTileableNoiseTable(128, 0x2c3e3a11);
  const nGridB = buildTileableNoiseTable(256, 0x182d3422);
  const nGridC = buildTileableNoiseTable(512, 0x34526833);
  const hBuf = new Uint8Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Seamless domain warp across [0..1)^2 to break all grid alignment
      const wx = (sampleBilinearTile(nGridA, 128, u * 5.0, v * 5.0) - 0.5) * 0.14;
      const wy = (sampleBilinearTile(nGridA, 128, u * 5.0 + 3.7, v * 5.0 + 1.9) - 0.5) * 0.14;
      const o1 = sampleBilinearTile(nGridA, 128, (u + wx) * 9.0, (v + wy) * 9.0);
      const o2 = sampleBilinearTile(nGridB, 256, (u - wy * 0.7) * 19.0 + 1.3, (v + wx * 0.7) * 19.0 + 2.7);
      const o3 = sampleBilinearTile(nGridB, 256, (u + wx * 0.4) * 37.0 + 4.1, (v - wy * 0.4) * 37.0 + 0.8);
      const o4 = sampleBilinearTile(nGridC, 512, u * 73.0, v * 73.0);
      const fbm = o1 * 0.40 + o2 * 0.30 + o3 * 0.19 + o4 * 0.11;
      const val = 128.0 + (fbm - 0.5) * 210.0;
      hBuf[y * size + x] = Math.max(6, Math.min(250, Math.round(val)));
    }
  }
  const normCanvas = buildNormalCanvasFromHeightBuffer(hBuf, size, size, 1.95);
  _cachedWaterRippleNormalTex = finalizeTexture(normCanvas, {
    repeatX: 1,
    repeatY: 1,
    srgb: false,
    anisotropy: 8,
  });
  return _cachedWaterRippleNormalTex;
}

/**
 * V6 Realistic Animated Normal-Mapped Fresnel Campus Water Material (`createRealisticCampusWaterMaterial`):
 * - Capped physical grazing Fresnel (`<= 0.42`) so low camera angles (`ndotv ~ 0.04–0.15`) preserve rich dark liquid
 *   absorption (`#182D34` deep teal-slate basin & `#233836` olive riparian bank — ZERO white snow blow-out!),
 * - Grazing reflection reflects riparian tree canopy & foothills (`#233836`) grading into deep coastal sky-slate (`#345268`),
 * - Rotated multi-angle 4-octave value-noise FBM + counter-drifting rotated normal maps (ZERO periodic sine stripes!),
 * - 100% NaN-guarded GLSL (`safeNorm3` + `pow(max(..., 1e-5), ...)`).
 */
export function createRealisticCampusWaterMaterial(options = {}) {
  const sunsetPreset = Boolean(options.sunsetPreset);
  const sunDirVec = options.sunDir
    ? options.sunDir.clone().normalize()
    : sunsetPreset
      ? new THREE.Vector3(-0.48, 0.28, -0.83).normalize()
      : new THREE.Vector3(-0.62, 0.34, -0.71).normalize();

  const skyHex = options.skyHex || (sunsetPreset ? "#3B5970" : "#345268");
  const horizonHex = options.horizonHex || (sunsetPreset ? "#2A3E3B" : "#233836");
  const depthHex = options.depthHex || "#233836";
  const deepBasinHex = options.deepHex || "#182D34";
  const glintHex = options.glintHex || (sunsetPreset ? "#F2D49B" : "#EBD09E");
  const maxFresnel = Number.isFinite(options.maxFresnel) ? Math.min(0.46, options.maxFresnel) : 0.42;
  const rippleNormalMap = getWaterRippleNormalTexture();

  const skyColor = new THREE.Color(skyHex);
  const horizonColor = new THREE.Color(horizonHex);
  const depthColor = new THREE.Color(depthHex);
  const deepColor = new THREE.Color(deepBasinHex);
  const glintColor = new THREE.Color(glintHex);

  const mat = new THREE.ShaderMaterial({
    name: "V6_RealisticCampusWaterMaterial",
    uniforms: {
      uTime: { value: 0.0 },
      uSunDir: { value: sunDirVec },
      uRippleNormalMap: { value: rippleNormalMap },
      uRippleScale: { value: Number.isFinite(options.rippleScale) ? options.rippleScale : 0.13 },
      uRippleStrength: { value: Number.isFinite(options.rippleStrength) ? options.rippleStrength : 0.072 },
      uMaxFresnel: { value: maxFresnel },
      uSkyColor: { value: skyColor },
      uSkyReflect: { value: skyColor },
      uHorizonColor: { value: horizonColor },
      uDepthColor: { value: depthColor },
      uShallowColor: { value: depthColor },
      uDeepColor: { value: deepColor },
      uGlintColor: { value: glintColor },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec2 vLocalUv;
      void main() {
        vLocalUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform sampler2D uRippleNormalMap;
      uniform float uRippleScale;
      uniform float uRippleStrength;
      uniform float uMaxFresnel;
      uniform vec3 uSkyColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uDepthColor;
      uniform vec3 uDeepColor;
      uniform vec3 uGlintColor;

      varying vec3 vWorldPos;
      varying vec2 vLocalUv;

      vec3 safeNorm3(vec3 v) {
        float l2 = dot(v, v);
        return l2 > 1e-8 ? v * inversesqrt(l2) : vec3(0.0, 1.0, 0.0);
      }

      void main() {
        vec2 p = vWorldPos.xz;
        mat2 uvRot = mat2(0.80, -0.60, 0.60, 0.80);

        // Triple rotated counter-drifting non-periodic domain-warped FBM normal-map layers (ZERO periodic stripes, 20x faster in SwiftShader!)
        vec2 uvA = p * uRippleScale + vec2(uTime * 0.024, -uTime * 0.019);
        vec2 uvB = (uvRot * p) * (uRippleScale * 1.73) + vec2(-uTime * 0.021, uTime * 0.027) + vec2(0.41, 0.67);
        vec2 uvSwell = (uvRot * p) * 0.029 + vec2(uTime * 0.0085, -uTime * 0.0065) + vec2(0.19, 0.53);
        vec2 uvDapple = p * 0.017 + vec2(0.37, -0.61);

        vec3 nA = texture2D(uRippleNormalMap, uvA).xyz * 2.0 - 1.0;
        vec3 nB = texture2D(uRippleNormalMap, uvB).xyz * 2.0 - 1.0;
        vec3 nSwell = texture2D(uRippleNormalMap, uvSwell).xyz * 2.0 - 1.0;
        vec3 nDapple = texture2D(uRippleNormalMap, uvDapple).xyz * 2.0 - 1.0;

        vec2 nBrot = uvRot * nB.xy;
        vec2 swellGrad = uvRot * nSwell.xy;
        float h0 = clamp(0.5 + (nSwell.x * 0.55 + nSwell.y * 0.45) * 0.85, 0.0, 1.0);
        float canopyDapple = clamp(0.5 + (nDapple.x * 0.60 + nDapple.y * 0.40) * 0.85, 0.0, 1.0);

        vec2 rippleSlope = (nA.xy * 0.52 + nBrot * 0.40) * uRippleStrength + swellGrad * 0.018;
        vec3 N = safeNorm3(vec3(-rippleSlope.x, 1.0, -rippleSlope.y));
        vec3 V = safeNorm3(cameraPosition - vWorldPos);
        vec3 L = safeNorm3(uSunDir);
        vec3 H = safeNorm3(L + V);
        vec3 R = reflect(-V, N);

        // Shoreline-to-center depth absorption (#233836 olive riparian bank -> #182D34 deep teal-slate basin)
        float edgeU = min(vLocalUv.x, 1.0 - vLocalUv.x);
        float edgeV = min(vLocalUv.y, 1.0 - vLocalUv.y);
        float bankMetric = min(edgeU, edgeV);
        float organicBankNoise = (h0 - 0.5) * 0.12;
        float depthMix = smoothstep(0.02, 0.34, bankMetric + organicBankNoise);
        vec3 waterBody = mix(uDepthColor, uDeepColor, depthMix);

        // Organic dappled riparian tree-canopy & bank shade (non-periodic FBM)
        float riparianShade = (1.0 - smoothstep(0.03, 0.38, bankMetric)) * (0.14 + 0.16 * canopyDapple);
        waterBody *= (1.0 - riparianShade);
        waterBody *= (0.92 + 0.14 * h0);

        // Grazing reflection: riparian tree-canopy/hillside (#233836) at low R.y -> deep coastal sky-slate (#345268) at higher R.y
        float reflElev = clamp(R.y * 1.85, 0.0, 1.0);
        vec3 reflHorizDir = safeNorm3(vec3(R.x, 0.0, R.z));
        vec3 sunHorizDir = safeNorm3(vec3(L.x, 0.0, L.z));
        float sunAz = max(dot(reflHorizDir, sunHorizDir), 0.0);
        float sunWarmAz = pow(max(sunAz, 1e-5), 3.0);

        vec3 envRefl = mix(uHorizonColor, uSkyColor, pow(max(reflElev, 1e-5), 0.72));
        // Subtle warm golden-amber horizon kiss strictly towards the sun azimuth (never bright white!)
        envRefl = mix(envRefl, vec3(0.28, 0.34, 0.35), sunWarmAz * (1.0 - reflElev) * 0.28);
        envRefl *= (0.88 + 0.20 * canopyDapple);

        // Capped grazing Schlick Fresnel (<= 0.42 <= 0.46) so water ALWAYS reads as rich dark liquid at ndotv ~ 0.04..0.15!
        float ndotv = clamp(dot(N, V), 0.0, 1.0);
        float rawFresnel = 0.04 + (uMaxFresnel - 0.04) * pow(max(1.0 - ndotv, 1e-5), 4.0);
        float fresnel = clamp(rawFresnel, 0.04, uMaxFresnel);
        vec3 col = mix(waterBody, envRefl, fresnel);

        // Pinpoint golden-hour capillary wavelet glints ONLY on steep sun-aligned facets (zero broad plastic sheen!)
        float rippleEnergy = smoothstep(0.018, 0.075, length(rippleSlope));
        float specTight = pow(max(dot(N, H), 1e-5), 280.0) * (0.16 + 0.62 * rippleEnergy);
        col += uGlintColor * specTight;

        // Subtle organic wet-stone meniscus darkening at shoreline contact
        float wetEdge = 1.0 - smoothstep(0.0, 0.024, bankMetric);
        col *= (1.0 - wetEdge * 0.16);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  mat.userData.isRealisticCampusWater = true;
  mat.userData.updateWaterTime = (elapsedSec) => {
    mat.uniforms.uTime.value = Number.isFinite(elapsedSec) ? elapsedSec : 0.0;
  };
  mat.updateWaterTime = mat.userData.updateWaterTime;
  return mat;
}

/**
 * Legacy alias upgraded to V6 `createRealisticCampusWaterMaterial` so all pond & creek surfaces
 * share the normal-mapped Fresnel water calibration automatically.
 */
export function createWaterPondMaterial(sunsetPreset = false) {
  return createRealisticCampusWaterMaterial({ sunsetPreset });
}

/**
 * Golden-Hour Drifting Atmospheric Dust Motes ShaderMaterial (`THREE.Points`, Clip 5 Sunset Bridge).
 */
export function createGoldenDustMotesMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uPixelRatio: { value: 1.5 },
      uColorWarm: { value: new THREE.Color("#ffe4a3") },
      uColorGold: { value: new THREE.Color("#ffae52") },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aScale;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTwinkle;
      varying float vTint;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = max(-mvPosition.z, 1.2);
        vTwinkle = 0.52 + 0.48 * sin(uTime * 2.3 + aPhase * 6.28318);
        vTint = fract(aPhase * 3.7);
        gl_PointSize = clamp((16.0 * aScale * uPixelRatio) / dist, 1.5, 11.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorWarm;
      uniform vec3 uColorGold;
      varying float vTwinkle;
      varying float vTint;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float r2 = dot(uv, uv);
        if (r2 > 0.25) discard;
        float soft = 1.0 - smoothstep(0.02, 0.25, r2);
        vec3 col = mix(uColorGold, uColorWarm, vTint);
        gl_FragColor = vec4(col, soft * vTwinkle * 0.62);
      }
    `,
  });
}

function overlayDragonscaleSolarGrid(ctx, w, h) {
  ctx.save();
  // Luminous silver-pearl photovoltaic ceramic glaze so Dragonscale shells hit Omni Zone 5 luminance (p50 ~ 0.13)
  ctx.fillStyle = "rgba(226, 234, 240, 0.42)";
  ctx.fillRect(0, 0, w, h);

  // Subtle photovoltaic diamond solar-cell wafer micro-grid + iridescent silver-white seam highlights
  ctx.strokeStyle = "rgba(74, 90, 108, 0.22)";
  ctx.lineWidth = Math.max(1, w / 256);
  const step = w / 8;
  for (let i = -w; i < w * 2; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i + h, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(245, 250, 255, 0.34)";
  ctx.lineWidth = Math.max(1, w / 320);
  const subStep = step * 0.5;
  for (let i = -w; i < w * 2; i += subStep) {
    ctx.beginPath();
    ctx.moveTo(i + 2, 0);
    ctx.lineTo(i + h + 2, h);
    ctx.stroke();
  }
  ctx.restore();
}

function buildDappledLeafGoboTexture() {
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  let s = 0x51a7beef;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Soft dappled redwood/oak canopy shadow clusters fading cleanly to transparent at patch edges
  for (let i = 0; i < 68; i++) {
    const angle = rnd() * Math.PI * 2;
    const rad = Math.pow(rnd(), 0.65) * (size * 0.40);
    const cx = size * 0.5 + Math.cos(angle) * rad;
    const cy = size * 0.5 + Math.sin(angle) * rad;
    const rx = 10 + rnd() * 24;
    const ry = 6 + rnd() * 15;
    const rot = rnd() * Math.PI;
    const edgeFade = 1.0 - Math.min(1.0, rad / (size * 0.44));
    const alpha = (0.14 + rnd() * 0.22) * edgeFade;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, rx);
    g.addColorStop(0.0, `rgba(18, 28, 38, ${alpha.toFixed(3)})`);
    g.addColorStop(0.58, `rgba(22, 34, 44, ${(alpha * 0.62).toFixed(3)})`);
    g.addColorStop(1.0, "rgba(22, 34, 44, 0.0)");
    ctx.fillStyle = g;
    ctx.scale(1.0, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return finalizeTexture(canvas, { srgb: true, clamp: true });
}

function buildAlphaLeafBoughTexture(isRedwood = false) {
  const size = 128;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  let s = isRedwood ? 0x7712cafe : 0x3391face;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const count = isRedwood ? 46 : 38;
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.pow(rnd(), 0.58) * (size * 0.39);
    const x = size * 0.5 + Math.cos(a) * r;
    const y = size * 0.5 + Math.sin(a) * r;
    const lx = isRedwood ? 15 + rnd() * 14 : 11 + rnd() * 12;
    const ly = isRedwood ? 4 + rnd() * 4 : 7 + rnd() * 7;
    const shade = Math.floor(rnd() * 36);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + (rnd() - 0.5) * 0.9);
    ctx.fillStyle = isRedwood
      ? `rgba(${42 + shade}, ${88 + shade}, ${44 + Math.floor(shade * 0.6)}, 0.96)`
      : `rgba(${68 + shade}, ${126 + shade}, ${54 + Math.floor(shade * 0.6)}, 0.96)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, lx, ly, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return finalizeTexture(canvas, { srgb: true, clamp: true });
}

export function createMaterialLibrary() {
  const decodePromises = [];

  // Procedural Bump & Detail Maps
  const featherBump = buildFeatherBumpMap();
  const beakPouch = buildBeakAndPouchMaps();
  const concreteBump = buildConcreteBump();
  const brickBump = buildBrickBump();
  const redwoodBump = buildRedwoodBump();
  const woodPlankBump = buildWoodPlankBump();
  const scallopShellBump = buildScallopShellBump();
  const lollipopMap = buildLollipopSpiralMap();
  const waferMaps = buildIceCreamWaferMaps();
  const chainguardTex = buildChainguardGraphicTexture(decodePromises);
  const chainguardWordmarkTex = buildChainguardWordmarkAlphaTexture(decodePromises);
  const scarfPolkaTex = buildScarfPolkaDotTexture();
  const baguetteTex = buildBaguetteTexture();
  const mackerelTex = buildMackerelTexture();
  const contactShadowTex = buildContactShadowTexture();

  // Wire ALL 12 Photorealistic Nano Banana Textures with Deterministic `readyPromise`!
  const brickMap = loadHybridNanoTexture(
    NANO_TEXTURES.brickPavers,
    drawBrickFallback,
    decodePromises,
    { repeatX: 1.25, repeatY: 1.25, anisotropy: 12 }
  );
  const concreteMap = loadHybridNanoTexture(
    NANO_TEXTURES.concretePath,
    drawConcreteFallback,
    decodePromises,
    { repeatX: 5, repeatY: 14, anisotropy: 12 }
  );
  const grassMap = loadHybridNanoTexture(
    NANO_TEXTURES.lawnGrass,
    drawGrassFallback,
    decodePromises,
    { repeatX: 12, repeatY: 12, anisotropy: 8, postOverlayFn: brightenSunlitGrassOverlay }
  );
  const mulchMap = loadHybridNanoTexture(
    NANO_TEXTURES.mulchSoil,
    drawMulchFallback,
    decodePromises,
    { repeatX: 8, repeatY: 8, anisotropy: 8 }
  );
  const foliageOakMap = loadHybridNanoTexture(
    NANO_TEXTURES.foliageOak,
    drawFoliageFallback,
    decodePromises,
    { repeatX: 3, repeatY: 3, anisotropy: 8 }
  );
  const foliageRedwoodMap = loadHybridNanoTexture(
    NANO_TEXTURES.foliageRedwood,
    drawFoliageFallback,
    decodePromises,
    { repeatX: 3, repeatY: 3, anisotropy: 8 }
  );
  const pelicanFeatherMap = loadHybridNanoTexture(
    NANO_TEXTURES.pelicanFeathers,
    drawFeatherFallback,
    decodePromises,
    { repeatX: 2, repeatY: 2, anisotropy: 12 }
  );
  const curtainGlassMap = loadHybridNanoTexture(
    NANO_TEXTURES.curtainGlass,
    drawCurtainGlassFallback,
    decodePromises,
    { repeatX: 3, repeatY: 2, anisotropy: 12, postOverlayFn: overlayCurtainGlassMullions }
  );
  const dragonscaleMap = loadHybridNanoTexture(
    NANO_TEXTURES.dragonscaleTiles,
    drawScallopFallback,
    decodePromises,
    { repeatX: 6, repeatY: 3, anisotropy: 12, postOverlayFn: overlayDragonscaleSolarGrid }
  );
  const dappledGoboTex = buildDappledLeafGoboTexture();
  const redwoodBoughTex = buildAlphaLeafBoughTexture(true);
  const deciduousBoughTex = buildAlphaLeafBoughTexture(false);
  const scallopShellMap = loadHybridNanoTexture(
    NANO_TEXTURES.scallopShell,
    drawScallopFallback,
    decodePromises,
    { repeatX: 5, repeatY: 3, anisotropy: 12 }
  );
  const bridgePlanksMap = loadHybridNanoTexture(
    NANO_TEXTURES.bridgePlanks,
    drawBridgePlanksFallback,
    decodePromises,
    { repeatX: 2, repeatY: 16, anisotropy: 12 }
  );
  const cedarTimberMap = loadHybridNanoTexture(
    NANO_TEXTURES.cedarTimber,
    drawCedarFallback,
    decodePromises,
    { repeatX: 3, repeatY: 2, anisotropy: 12 }
  );

  const v3CampusMaterials = buildOpenCampusMaterials({ brickBump });
  const microGrain = v3CampusMaterials._suites.microGrainSuite;
  const unitWhiteMetalMap = v3CampusMaterials._suites.unitWhiteMetalMap;
  const boardFormedSuite = v3CampusMaterials._suites.boardFormedConcreteSuite;
  const dragonscaleSolarSuite = v3CampusMaterials._suites.dragonscaleSolarSuite;
  const redwoodBarkSuite = v3CampusMaterials._suites.redwoodBarkSuite;
  const limestonePaversSuite = v3CampusMaterials._suites.limestonePaversSuite;

  const cedarTimberMat = new THREE.MeshStandardMaterial({
    name: "V7_Planter_WesternRedCedar",
    color: "#9A623D",
    map: cedarTimberMap,
    normalMap: microGrain.cedarNormal,
    normalScale: new THREE.Vector2(0.82, 0.82),
    aoMap: microGrain.cedarOrm,
    aoMapIntensity: 0.50,
    roughnessMap: microGrain.cedarOrm,
    metalnessMap: microGrain.cedarOrm,
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.34,
  });

  const readyPromise = Promise.all(decodePromises);

  const lib = {
    readyPromise,
    textures: {
      contactShadowTex,
      chainguardTex,
      lollipopMap,
      brickMap: limestonePaversSuite.map,
      concreteMap,
      grassMap,
      mulchMap,
      foliageOakMap,
      foliageRedwoodMap,
      pelicanFeatherMap,
      curtainGlassMap,
      dragonscaleMap,
      scallopShellMap,
      bridgePlanksMap,
      cedarTimberMap,
      scarfPolkaTex,
      baguetteTex,
      mackerelTex,
      waferMap: waferMaps.map,
      ...v3CampusMaterials._textures,
    },

    // --- Pelican Plumage, Beak & Classic Cycling Attire Materials (V6 De-Plasticized Matte Feather & Keratin) ---
    pelicanPlumage: new THREE.MeshStandardMaterial({
      color: "#ECE8DF",
      map: pelicanFeatherMap,
      bumpMap: featherBump,
      bumpScale: 0.009,
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.82,
      metalness: 0.0,
      envMapIntensity: 0.46,
    }),
    pelicanBreastWarm: new THREE.MeshStandardMaterial({
      color: "#EAE0CA",
      map: pelicanFeatherMap,
      bumpMap: featherBump,
      bumpScale: 0.008,
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.80,
      metalness: 0.0,
      envMapIntensity: 0.46,
    }),
    pelicanBlackPrimary: new THREE.MeshStandardMaterial({
      color: "#2E2B27",
      bumpMap: featherBump,
      bumpScale: 0.007,
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.76,
      metalness: 0.02,
      envMapIntensity: 0.48,
    }),
    pelicanCrestYellow: new THREE.MeshStandardMaterial({
      color: "#E8C964",
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.78,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),
    pelicanBeakUpper: new THREE.MeshStandardMaterial({
      color: "#D87A32",
      bumpMap: beakPouch.pouchBump,
      bumpScale: 0.0035,
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.58,
      metalness: 0.02,
      envMapIntensity: 0.52,
    }),
    pelicanBeakMandible: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      vertexColors: true,
      bumpMap: beakPouch.pouchBump,
      bumpScale: 0.0035,
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.58,
      metalness: 0.02,
      envMapIntensity: 0.52,
    }),
    pelicanBeakTip: new THREE.MeshStandardMaterial({
      color: "#C8462C",
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.52,
      metalness: 0.02,
    }),
    pelicanGularPouch: new THREE.MeshStandardMaterial({
      color: "#CC8934",
      bumpMap: beakPouch.pouchBump,
      bumpScale: 0.008,
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.64,
      metalness: 0.0,
      emissive: "#4a2004",
      emissiveIntensity: 0.06,
      side: THREE.DoubleSide,
    }),
    pelicanLegsOrange: new THREE.MeshStandardMaterial({
      color: "#D46824",
      bumpMap: beakPouch.pouchBump,
      bumpScale: 0.0045,
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.62,
      metalness: 0.02,
    }),
    pelicanWebOrange: new THREE.MeshStandardMaterial({
      color: "#DC7A2A",
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.64,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),
    pelicanEyeRing: new THREE.MeshStandardMaterial({
      color: "#D88E1A",
      roughness: 0.58,
    }),
    pelicanIris: new THREE.MeshStandardMaterial({
      color: "#d97706",
      roughness: 0.22,
    }),
    pelicanPupil: new THREE.MeshStandardMaterial({
      color: "#090b10",
      roughness: 0.14,
    }),
    pelicanCatchlight: new THREE.MeshBasicMaterial({
      color: "#ffffff",
    }),

    // Classic Cyclist Cap (`Casquette`) & Polka-Dot Scarf
    capNavy: new THREE.MeshStandardMaterial({
      color: "#1e3a6e",
      normalMap: microGrain.canvasNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      aoMap: microGrain.canvasOrm,
      aoMapIntensity: 0.35,
      roughnessMap: microGrain.canvasOrm,
      metalnessMap: microGrain.canvasOrm,
      roughness: 0.92,
      metalness: 0.0,
    }),
    capGoldStripe: new THREE.MeshStandardMaterial({
      color: "#DDA52B",
      roughness: 0.68,
      metalness: 0.04,
    }),
    capVisorWhite: new THREE.MeshStandardMaterial({
      color: "#ECEAE4",
      roughness: 0.66,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    capTrimRed: new THREE.MeshStandardMaterial({
      color: "#C6362C",
      roughness: 0.68,
      metalness: 0.02,
    }),
    scarfPolkaDot: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: scarfPolkaTex,
      normalMap: microGrain.canvasNormal,
      normalScale: new THREE.Vector2(0.42, 0.42),
      aoMap: microGrain.canvasOrm,
      aoMapIntensity: 0.35,
      roughnessMap: microGrain.canvasOrm,
      metalnessMap: microGrain.canvasOrm,
      roughness: 0.96,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),

    // --- GBike Authentic Campus Powder-Coat & Basket Prop Materials (V6) ---
    gbikeFrameRed: new THREE.MeshPhysicalMaterial({
      color: "#C6362C",
      roughness: 0.42,
      metalness: 0.08,
      clearcoat: 0.35,
      clearcoatRoughness: 0.28,
      envMapIntensity: 0.82,
    }),
    gbikeForkBlue: new THREE.MeshPhysicalMaterial({
      color: "#2A62AD",
      roughness: 0.42,
      metalness: 0.08,
      clearcoat: 0.35,
      clearcoatRoughness: 0.28,
      envMapIntensity: 0.82,
    }),
    gbikeChainguardGraphic: new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      map: chainguardTex,
      roughness: 0.52,
      metalness: 0.06,
      clearcoat: 0.24,
      clearcoatRoughness: 0.34,
      envMapIntensity: 0.58,
    }),
    gbikeChainguardWordmarkXray: new THREE.MeshBasicMaterial({
      map: chainguardWordmarkTex,
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    gbikeYellow: new THREE.MeshPhysicalMaterial({
      color: "#DDA52B",
      roughness: 0.42,
      metalness: 0.08,
      clearcoat: 0.35,
      clearcoatRoughness: 0.28,
      envMapIntensity: 0.82,
    }),
    gbikeGreen: new THREE.MeshPhysicalMaterial({
      color: "#2C854A",
      roughness: 0.42,
      metalness: 0.08,
      clearcoat: 0.35,
      clearcoatRoughness: 0.28,
      envMapIntensity: 0.82,
    }),
    gbikeChrome: new THREE.MeshStandardMaterial({
      color: "#e6ecf2",
      roughness: 0.22,
      metalness: 0.86,
      envMapIntensity: 1.25,
    }),
    gbikeAlloy: new THREE.MeshStandardMaterial({
      color: "#d4dce6",
      roughness: 0.26,
      metalness: 0.84,
      envMapIntensity: 1.15,
    }),
    gbikeChainSteel: new THREE.MeshStandardMaterial({
      color: "#4a5360",
      roughness: 0.34,
      metalness: 0.80,
      envMapIntensity: 1.05,
    }),
    gbikeChainRoller: new THREE.MeshStandardMaterial({
      color: "#9aa6b5",
      roughness: 0.26,
      metalness: 0.85,
      envMapIntensity: 1.10,
    }),
    gbikeBrass: new THREE.MeshStandardMaterial({
      color: "#c8a236",
      roughness: 0.30,
      metalness: 0.82,
      envMapIntensity: 1.10,
    }),
    gbikeTireRubber: new THREE.MeshStandardMaterial({
      color: "#232426",
      bumpMap: concreteBump,
      bumpScale: 0.005,
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.88,
      metalness: 0.0,
      envMapIntensity: 0.22,
    }),
    gbikeCruiserTire: new THREE.MeshStandardMaterial({
      color: "#E4DCC8",
      bumpMap: concreteBump,
      bumpScale: 0.004,
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.82,
      metalness: 0.0,
    }),
    gbikeWhitewall: new THREE.MeshStandardMaterial({
      color: "#EDE6D8",
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.80,
      metalness: 0.0,
    }),
    gbikeSaddleLeather: new THREE.MeshStandardMaterial({
      color: "#212328",
      bumpMap: concreteBump,
      bumpScale: 0.003,
      roughnessMap: microGrain.fiberglassUnitRoughness,
      roughness: 0.62,
      metalness: 0.02,
    }),
    gbikeBasketLiner: new THREE.MeshStandardMaterial({
      color: GBIKE_COLORS.basketCharcoal,
      roughness: 0.82,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
    baguetteCrust: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: baguetteTex,
      roughness: 0.78,
      metalness: 0.0,
    }),
    mackerelSilver: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: mackerelTex,
      roughness: 0.38,
      metalness: 0.42,
      envMapIntensity: 0.95,
    }),
    reflectorRuby: new THREE.MeshStandardMaterial({
      color: "#b91c1c",
      emissive: "#450a0a",
      emissiveIntensity: 0.14,
      roughness: 0.32,
      metalness: 0.12,
    }),
    reflectorAmber: new THREE.MeshStandardMaterial({
      color: "#d97706",
      emissive: "#451a03",
      emissiveIntensity: 0.12,
      roughness: 0.34,
    }),
    reflectorWhite: new THREE.MeshStandardMaterial({
      color: "#f1f5f9",
      roughness: 0.28,
      metalness: 0.15,
    }),
    contactShadow: new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),

    // --- SwiftShader Fill-Rate Optimized Lambert Background Ground Aprons ---
    apronConcreteLambert: new THREE.MeshLambertMaterial({
      color: "#ffffff",
      map: v3CampusMaterials._textures.concreteSidewalkMap,
    }),
    apronGrassLambert: new THREE.MeshLambertMaterial({
      color: "#ffffff",
      map: v3CampusMaterials._textures.turfLawnMap,
      emissive: "#162410",
      emissiveIntensity: 0.06,
    }),
    apronMulchLambert: new THREE.MeshLambertMaterial({
      color: "#82644B",
      map: mulchMap,
    }),
    coastalMeadowLambert: new THREE.MeshLambertMaterial({
      color: "#9E8D68",
      map: v3CampusMaterials._textures.turfLawnMap,
      emissive: "#241d10",
      emissiveIntensity: 0.06,
    }),

    // --- Mountain View Campus Environment Materials (AAA V7 Calibrated PBR + Packed ORM + POM) ---
    concretePath: v3CampusMaterials.materials.concreteSidewalk,
    concreteCurb: v3CampusMaterials.materials.graniteCurb,
    brickPath: v3CampusMaterials.materials.sandstonePavers,
    campusWater: createRealisticCampusWaterMaterial(),
    bridgePlanks: new THREE.MeshStandardMaterial({
      name: "V7_Bridge_IpeTimberPlanks",
      color: "#7A634F",
      map: bridgePlanksMap,
      normalMap: microGrain.cedarNormal,
      normalScale: new THREE.Vector2(0.82, 0.82),
      aoMap: microGrain.cedarOrm,
      aoMapIntensity: 0.55,
      roughnessMap: microGrain.cedarOrm,
      metalnessMap: microGrain.cedarOrm,
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.30,
    }),
    cortenTruss: new THREE.MeshStandardMaterial({
      name: "V7_Bridge_WeatheredCortenSteel",
      color: "#6E4730",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.68, 0.68),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.46,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.80,
      metalness: 0.35,
      envMapIntensity: 0.48,
    }),
    bridgeRailing: new THREE.MeshStandardMaterial({
      name: "V7_Bridge_SatinSteelRailing",
      color: "#8E98A2",
      normalMap: microGrain.steelNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.38,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.58,
      metalness: 0.58,
      envMapIntensity: 0.72,
    }),
    lawnGrass: v3CampusMaterials.materials.turfLawnPbr,
    mulchSoil: new THREE.MeshStandardMaterial({
      color: "#7A5D46",
      map: mulchMap,
      bumpMap: redwoodBump,
      bumpScale: 0.014,
      roughness: 0.94,
      metalness: 0.0,
    }),
    redwoodBark: new THREE.MeshStandardMaterial({
      name: "V7_Boulder_CoastRedwoodBark",
      color: "#ffffff",
      map: redwoodBarkSuite.map,
      normalMap: redwoodBarkSuite.normalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      aoMap: redwoodBarkSuite.ormMap,
      aoMapIntensity: 0.72,
      roughnessMap: redwoodBarkSuite.ormMap,
      metalnessMap: redwoodBarkSuite.ormMap,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.24,
    }),
    foliageDeep: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#1c3114",
      emissiveIntensity: 0.08,
      map: foliageOakMap,
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.0,
    }),
    foliageWillow: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#1e3414",
      emissiveIntensity: 0.08,
      map: foliageOakMap,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.0,
    }),
    foliageGolden: new THREE.MeshStandardMaterial({
      color: "#fffbe6",
      emissive: "#263112",
      emissiveIntensity: 0.08,
      map: foliageOakMap,
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.0,
    }),
    foliageRedwood: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#1c3416",
      emissiveIntensity: 0.09,
      map: foliageRedwoodMap,
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.0,
    }),
    umbrellaRed: new THREE.MeshStandardMaterial({
      name: "V7_Umbrella_Sunbrella_Red",
      color: "#B84A3E",
      normalMap: microGrain.canvasNormal,
      normalScale: new THREE.Vector2(0.62, 0.62),
      aoMap: microGrain.canvasOrm,
      aoMapIntensity: 0.42,
      roughnessMap: microGrain.canvasOrm,
      metalnessMap: microGrain.canvasOrm,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.24,
    }),
    umbrellaBlue: new THREE.MeshStandardMaterial({
      name: "V7_Umbrella_Sunbrella_Blue",
      color: "#4672B0",
      normalMap: microGrain.canvasNormal,
      normalScale: new THREE.Vector2(0.62, 0.62),
      aoMap: microGrain.canvasOrm,
      aoMapIntensity: 0.42,
      roughnessMap: microGrain.canvasOrm,
      metalnessMap: microGrain.canvasOrm,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.24,
    }),
    umbrellaGreen: new THREE.MeshStandardMaterial({
      name: "V7_Umbrella_Sunbrella_Green",
      color: "#3E7E4E",
      normalMap: microGrain.canvasNormal,
      normalScale: new THREE.Vector2(0.62, 0.62),
      aoMap: microGrain.canvasOrm,
      aoMapIntensity: 0.42,
      roughnessMap: microGrain.canvasOrm,
      metalnessMap: microGrain.canvasOrm,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.24,
    }),
    umbrellaYellow: new THREE.MeshStandardMaterial({
      name: "V7_Umbrella_Sunbrella_Yellow",
      color: "#CCA034",
      normalMap: microGrain.canvasNormal,
      normalScale: new THREE.Vector2(0.62, 0.62),
      aoMap: microGrain.canvasOrm,
      aoMapIntensity: 0.42,
      roughnessMap: microGrain.canvasOrm,
      metalnessMap: microGrain.canvasOrm,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.24,
    }),
    umbrellaCream: new THREE.MeshStandardMaterial({
      name: "V7_Umbrella_Sunbrella_Ecru",
      color: "#E6DEC8",
      normalMap: microGrain.canvasNormal,
      normalScale: new THREE.Vector2(0.62, 0.62),
      aoMap: microGrain.canvasOrm,
      aoMapIntensity: 0.42,
      roughnessMap: microGrain.canvasOrm,
      metalnessMap: microGrain.canvasOrm,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.26,
      side: THREE.DoubleSide,
    }),
    cattailVelvetBrown: new THREE.MeshStandardMaterial({
      color: "#4a2c18",
      emissive: "#160b04",
      emissiveIntensity: 0.04,
      roughness: 0.90,
      metalness: 0.0,
    }),
    coastalHillGold: new THREE.MeshStandardMaterial({
      name: "V6_Ridgeline_ChaparralGold",
      color: "#7E765E",
      emissive: "#242018",
      emissiveIntensity: 0.04,
      roughness: 0.96,
      metalness: 0.0,
    }),
    horizonFoothillsRidge: new THREE.MeshLambertMaterial({
      name: "V6_Ridgeline_Santa_Cruz_Chaparral",
      color: "#C4CFCB",
      map: v3CampusMaterials._textures.chaparralFoothillsMap,
      bumpMap: v3CampusMaterials._textures.chaparralFoothillsBump,
      bumpScale: 0.16,
      emissive: "#384644",
      emissiveIntensity: 0.16,
      vertexColors: true,
      fog: true,
    }),
    horizonDistantRange: new THREE.MeshBasicMaterial({
      name: "V6_Horizon_Mountain_NeutralMist",
      color: "#DCE5EC",
      vertexColors: false,
      fog: true,
    }),
    agaveBlueGreen: new THREE.MeshStandardMaterial({
      color: "#5C8A7A",
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.36,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.68,
      metalness: 0.0,
    }),
    lavenderBloom: new THREE.MeshStandardMaterial({
      color: "#7E66B3",
      roughness: 0.78,
      metalness: 0.0,
    }),
    marshReedGold: new THREE.MeshStandardMaterial({
      color: "#BA9252",
      emissive: "#2e1c06",
      emissiveIntensity: 0.06,
      roughness: 0.82,
      metalness: 0.0,
    }),
    dragonscaleTile: new THREE.MeshStandardMaterial({
      name: "Dragonscale_Pavilion_Shell_V7",
      color: "#A9B4BC",
      map: dragonscaleMap,
      normalMap: dragonscaleSolarSuite.normalMap,
      normalScale: new THREE.Vector2(0.88, 0.88),
      aoMap: dragonscaleSolarSuite.ormMap,
      aoMapIntensity: 0.68,
      roughnessMap: dragonscaleSolarSuite.ormMap,
      metalnessMap: dragonscaleSolarSuite.ormMap,
      emissive: "#1c2429",
      emissiveIntensity: 0.04,
      roughness: 1.0,
      metalness: 0.62,
      envMapIntensity: 1.10,
      side: THREE.DoubleSide,
    }),
    architecturalConcretePier: new THREE.MeshStandardMaterial({
      name: "Campus_Pavilion_BoardFormedPier_V7",
      color: "#DFDDD4",
      map: boardFormedSuite.map,
      normalMap: boardFormedSuite.normalMap,
      normalScale: new THREE.Vector2(0.78, 0.78),
      aoMap: boardFormedSuite.ormMap,
      aoMapIntensity: 0.62,
      roughnessMap: boardFormedSuite.ormMap,
      metalnessMap: boardFormedSuite.ormMap,
      emissive: "#1c1b18",
      emissiveIntensity: 0.04,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.36,
    }),
    gradientShell: new THREE.MeshStandardMaterial({
      name: "Gradient_Canopy_Dragonscale_V7",
      color: "#A9B4BC",
      map: dragonscaleMap,
      normalMap: dragonscaleSolarSuite.normalMap,
      normalScale: new THREE.Vector2(0.88, 0.88),
      aoMap: dragonscaleSolarSuite.ormMap,
      aoMapIntensity: 0.68,
      roughnessMap: dragonscaleSolarSuite.ormMap,
      metalnessMap: dragonscaleSolarSuite.ormMap,
      roughness: 1.0,
      metalness: 0.62,
      emissive: "#1c2429",
      emissiveIntensity: 0.04,
      envMapIntensity: 1.10,
      side: THREE.DoubleSide,
    }),
    canopySilverDragonscale: new THREE.MeshStandardMaterial({
      name: "V7_Canopy_SilverDragonscaleShell",
      color: "#A9B4BC",
      map: dragonscaleMap,
      normalMap: dragonscaleSolarSuite.normalMap,
      normalScale: new THREE.Vector2(0.88, 0.88),
      aoMap: dragonscaleSolarSuite.ormMap,
      aoMapIntensity: 0.68,
      roughnessMap: dragonscaleSolarSuite.ormMap,
      metalnessMap: dragonscaleSolarSuite.ormMap,
      emissive: "#1c2429",
      emissiveIntensity: 0.04,
      roughness: 1.0,
      metalness: 0.62,
      envMapIntensity: 1.10,
      side: THREE.DoubleSide,
    }),
    canopyBullnoseFascia: new THREE.MeshStandardMaterial({
      name: "V7_Canopy_BullnoseSilverFascia",
      color: "#B8BEC4",
      normalMap: microGrain.steelNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.36,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.34,
      metalness: 0.76,
      envMapIntensity: 1.15,
    }),
    canopyWarmHoneySoffit: new THREE.MeshStandardMaterial({
      name: "V7_Canopy_WarmTimberSoffit",
      color: "#A6784B",
      map: cedarTimberMap,
      normalMap: microGrain.cedarNormal,
      normalScale: new THREE.Vector2(0.65, 0.65),
      aoMap: microGrain.cedarOrm,
      aoMapIntensity: 0.48,
      roughnessMap: microGrain.cedarOrm,
      metalnessMap: microGrain.cedarOrm,
      emissive: "#291d11",
      emissiveIntensity: 0.06,
      roughness: 0.88,
      metalness: 0.0,
      envMapIntensity: 0.42,
      side: THREE.DoubleSide,
    }),
    canopySkyGlass: new THREE.MeshStandardMaterial({
      name: "V7_Canopy_SmileClerestoryGlass",
      color: "#7F9CB2",
      map: curtainGlassMap,
      emissive: "#22303b",
      emissiveIntensity: 0.12,
      roughness: 0.14,
      metalness: 0.22,
      envMapIntensity: 1.25,
    }),
    canopyClerestoryGlow: new THREE.MeshStandardMaterial({
      name: "V7_Canopy_DaylightAtrium",
      color: "#8BA6B8",
      map: curtainGlassMap,
      emissive: "#2a3944",
      emissiveIntensity: 0.14,
      roughness: 0.24,
      metalness: 0.12,
      envMapIntensity: 1.05,
    }),
    canopyLimestonePier: new THREE.MeshStandardMaterial({
      name: "V7_Canopy_BoardFormedLimestonePier",
      color: "#DFDDD4",
      map: boardFormedSuite.map,
      normalMap: boardFormedSuite.normalMap,
      normalScale: new THREE.Vector2(0.76, 0.76),
      aoMap: boardFormedSuite.ormMap,
      aoMapIntensity: 0.60,
      roughnessMap: boardFormedSuite.ormMap,
      metalnessMap: boardFormedSuite.ormMap,
      emissive: "#1e1d1a",
      emissiveIntensity: 0.04,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.36,
    }),
    canopyAnodizedAluminum: new THREE.MeshStandardMaterial({
      name: "V7_Canopy_AnodizedAluminum",
      color: "#9EA6AE",
      normalMap: microGrain.steelNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.36,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      metalness: 0.68,
      roughness: 0.58,
      envMapIntensity: 0.78,
    }),
    champagneDiagridSoffit: new THREE.MeshStandardMaterial({
      color: "#E2E4E6",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.30, 0.30),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.36,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.58,
      metalness: 0.18,
      emissive: "#242628",
      emissiveIntensity: 0.04,
      envMapIntensity: 0.52,
      side: THREE.DoubleSide,
    }),
    dappledShadowGobo: new THREE.MeshBasicMaterial({
      map: dappledGoboTex,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
    foliageRedwoodBough: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: redwoodBoughTex,
      alphaTest: 0.42,
      roughness: 0.84,
      metalness: 0.0,
      emissive: "#16290e",
      emissiveIntensity: 0.07,
      side: THREE.DoubleSide,
    }),
    foliageDeciduousBough: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: deciduousBoughTex,
      alphaTest: 0.42,
      roughness: 0.82,
      metalness: 0.0,
      emissive: "#1b3012",
      emissiveIntensity: 0.07,
      side: THREE.DoubleSide,
    }),
    clerestoryGlow: new THREE.MeshStandardMaterial({
      color: "#d9e8f5",
      map: curtainGlassMap,
      emissive: "#ffd596",
      emissiveIntensity: 0.14,
      roughness: 0.18,
      metalness: 0.22,
      envMapIntensity: 1.15,
    }),
    curtainGlass: new THREE.MeshStandardMaterial({
      color: "#7E94A2",
      map: curtainGlassMap,
      roughness: 0.10,
      metalness: 0.14,
      envMapIntensity: 1.25,
      emissive: "#161510",
      emissiveIntensity: 0.12,
    }),
    steelMullion: new THREE.MeshStandardMaterial({
      color: "#332C24",
      emissive: "#080605",
      emissiveIntensity: 0.02,
      roughness: 0.48,
      metalness: 0.68,
      envMapIntensity: 0.52,
    }),
    cedarTimber: cedarTimberMat,
    warmWood: cedarTimberMat,
    visitorCedar2000: cedarTimberMat,
    gymAcousticCedarSlat: new THREE.MeshStandardMaterial({
      name: "V7_Planter_SpinStudioCedarSlat",
      color: "#8B5A38",
      map: cedarTimberMap,
      normalMap: microGrain.cedarNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      aoMap: microGrain.cedarOrm,
      aoMapIntensity: 0.52,
      roughnessMap: microGrain.cedarOrm,
      metalnessMap: microGrain.cedarOrm,
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.34,
    }),
    gymTrainerMatRubber: new THREE.MeshStandardMaterial({
      color: "#26282C",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.40,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.84,
      metalness: 0.0,
      envMapIntensity: 0.26,
    }),
    stanBronze: new THREE.MeshStandardMaterial({
      name: "Mat_Stan_Bronze_Museum_V7",
      color: "#4A3B28",
      emissive: "#0d0b09",
      emissiveIntensity: 0.035,
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.45,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.48,
      metalness: 0.82,
      envMapIntensity: 0.60,
    }),
    stanTooth: new THREE.MeshStandardMaterial({
      color: "#6E583A",
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.42,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.48,
      metalness: 0.72,
      envMapIntensity: 0.60,
    }),
    stanLimestonePlinth: new THREE.MeshStandardMaterial({
      name: "Mat_Stan_Plinth_Boulder_Limestone_V7",
      color: "#D8D2C6",
      map: limestonePaversSuite.map,
      normalMap: limestonePaversSuite.normalMap,
      normalScale: new THREE.Vector2(0.86, 0.86),
      aoMap: limestonePaversSuite.ormMap,
      aoMapIntensity: 0.65,
      roughnessMap: limestonePaversSuite.ormMap,
      metalnessMap: limestonePaversSuite.ormMap,
      roughness: 1.0,
      metalness: 0.02,
      envMapIntensity: 0.38,
    }),
    terracottaSpandrel: new THREE.MeshStandardMaterial({
      name: "V7_Boulder_OfficeLimestoneSpandrel",
      color: "#B99B82",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.70, 0.70),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.45,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.80,
      metalness: 0.02,
      envMapIntensity: 0.36,
    }),
    pearlTitaniumMonument: new THREE.MeshStandardMaterial({
      color: "#6A6360",
      normalMap: microGrain.steelNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.40,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.38,
      metalness: 0.78,
      envMapIntensity: 0.92,
    }),
    // --- De-Plasticized Satin Architectural Fiberglass Android Statues & Lawn Sculptures (Packed ORM, zero bumpMap) ---
    flamingoPink: new THREE.MeshStandardMaterial({
      name: "V7_Planter_FlamingoFiberglass",
      color: "#CF6A82",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.42, 0.42),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.40,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.68,
      metalness: 0.0,
      envMapIntensity: 0.28,
    }),
    androidGreen: new THREE.MeshStandardMaterial({
      name: "V7_Planter_AndroidFiberglass",
      color: "#689F38",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.44, 0.44),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.40,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.68,
      metalness: 0.02,
      envMapIntensity: 0.30,
    }),
    donutDough: new THREE.MeshStandardMaterial({
      name: "V7_Planter_SculptureDough",
      color: "#C48E56",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.42, 0.42),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.40,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.74,
      metalness: 0.0,
      envMapIntensity: 0.28,
    }),
    donutIcingPink: new THREE.MeshStandardMaterial({
      name: "V7_Planter_SculptureIcing",
      color: "#C76B8A",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.40, 0.40),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.40,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.66,
      metalness: 0.0,
      envMapIntensity: 0.30,
    }),
    cupcakeFrosting: new THREE.MeshStandardMaterial({
      name: "V7_Planter_SculptureFrosting",
      color: "#CED9A6",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.38, 0.38),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.40,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.68,
      metalness: 0.0,
      envMapIntensity: 0.30,
    }),
    cupcakeCup: new THREE.MeshStandardMaterial({
      name: "V7_Planter_SculptureCup",
      color: "#E8ECEF",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.42, 0.42),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.40,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.68,
      metalness: 0.0,
      envMapIntensity: 0.30,
    }),
    iceCreamWafer: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: waferMaps.map,
      bumpMap: waferMaps.bumpMap,
      bumpScale: 0.022,
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.38,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.78,
      metalness: 0.0,
      envMapIntensity: 0.28,
    }),
    iceCreamVanilla: new THREE.MeshStandardMaterial({
      name: "V7_Planter_SculptureVanilla",
      color: "#EDE5D2",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.44, 0.44),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.40,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.68,
      metalness: 0.0,
      envMapIntensity: 0.30,
    }),
    lollipopCandy: new THREE.MeshStandardMaterial({
      name: "V7_Planter_SculptureLollipop",
      color: "#EAE6DF",
      map: lollipopMap,
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.38, 0.38),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.40,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.66,
      metalness: 0.0,
      envMapIntensity: 0.32,
    }),
    gingerbreadCookie: new THREE.MeshStandardMaterial({
      name: "V7_Planter_SculptureGingerbread",
      color: "#8F5730",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.50, 0.50),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.42,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.78,
      metalness: 0.0,
      envMapIntensity: 0.26,
    }),
    chocolateWafer: new THREE.MeshStandardMaterial({
      name: "V7_Planter_SculptureChocolate",
      color: "#452718",
      normalMap: microGrain.fiberglassNormal,
      normalScale: new THREE.Vector2(0.40, 0.40),
      aoMap: microGrain.fiberglassUnitOrm,
      aoMapIntensity: 0.40,
      roughnessMap: microGrain.fiberglassUnitOrm,
      metalnessMap: microGrain.fiberglassUnitOrm,
      roughness: 0.70,
      metalness: 0.0,
      envMapIntensity: 0.28,
    }),
    shorelineTent: new THREE.MeshStandardMaterial({
      name: "V7_Umbrella_ShorelineTensileMembrane",
      color: "#F4EFE6",
      normalMap: microGrain.canvasNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      aoMap: microGrain.canvasOrm,
      aoMapIntensity: 0.42,
      roughnessMap: microGrain.canvasOrm,
      metalnessMap: microGrain.canvasOrm,
      emissive: "#ffd596",
      emissiveIntensity: 0.06,
      roughness: 0.88,
      metalness: 0.0,
      envMapIntensity: 0.42,
      side: THREE.DoubleSide,
    }),

    // --- Open-World Mountain View Campus AAA V7 PBR Street, Turf, Gym & Quest Materials ---
    ...v3CampusMaterials.materials,
  };

  // Run V5 graniteCurb (#918675 + 1.8m joints + gutter grime AO), concreteGutter, turfEdging,
  // and Zone 6 Shoreline Keynote basalt/inlay material suite first...
  const v5RoadCurbPbr = upgradeRoadAndCurbRealism(THREE, {
    materials: lib,
    resolution: 1024,
    anisotropy: 12,
  });
  lib.textures.v5RoadCurbPbr = v5RoadCurbPbr;
  lib.textures.graniteCurbMap = v5RoadCurbPbr.graniteCurb.map;
  if (v5RoadCurbPbr.shorelineKeynote) {
    lib.textures.shorelineBasaltMap = v5RoadCurbPbr.shorelineKeynote.basaltMap;
    lib.textures.shorelineBasaltNormal = v5RoadCurbPbr.shorelineKeynote.basaltNormal;
    lib.textures.shorelineBasaltRoughness = v5RoadCurbPbr.shorelineKeynote.basaltOrm || v5RoadCurbPbr.shorelineKeynote.basaltRoughness;
  }

  // ...and then authoritatively restore & bind V7 Sun-Aged California Aggregate Asphalt (#525458, Packed ORM),
  // V7 Architectural Limestone/Sierra Granite Running-Bond Plaza Pavers (#8F8578..#A39889, Packed ORM + POM),
  // and V7 Visitor Experience Interlocking Hexagonal Granite Pavers (#B6B4AE, Packed ORM + POM) — because
  // `upgradeRoadAndCurbRealism` mutates `m.roadAsphalt` and `m.brickPath` in-place via `patchStdMat`!
  const v6Suites = v3CampusMaterials._suites;
  const v6RoadMat = v3CampusMaterials.materials.roadAsphalt;
  v6RoadMat.name = "V7_Asphalt_Aggregate_Boulder";
  v6RoadMat.color.set("#ffffff");
  v6RoadMat.map = v6Suites.asphaltSuite.map;
  v6RoadMat.normalMap = v6Suites.asphaltSuite.normalMap;
  v6RoadMat.normalScale.set(0.88, 0.88);
  v6RoadMat.bumpMap = null;
  v6RoadMat.bumpScale = 0;
  v6RoadMat.aoMap = v6Suites.asphaltSuite.ormMap;
  v6RoadMat.aoMapIntensity = 0.55;
  v6RoadMat.roughnessMap = v6Suites.asphaltSuite.ormMap;
  v6RoadMat.metalnessMap = v6Suites.asphaltSuite.ormMap;
  v6RoadMat.roughness = 1.0;
  v6RoadMat.metalness = 0.0;
  v6RoadMat.envMapIntensity = 0.20;
  v6RoadMat.needsUpdate = true;

  const v6LimestoneMat = v3CampusMaterials.materials.sandstonePavers;
  v6LimestoneMat.name = "V7_Limestone_Planter_Pavers";
  v6LimestoneMat.color.set("#ffffff");
  v6LimestoneMat.map = v6Suites.limestonePaversSuite.map;
  v6LimestoneMat.normalMap = v6Suites.limestonePaversSuite.normalMap;
  v6LimestoneMat.normalScale.set(0.92, 0.92);
  v6LimestoneMat.bumpMap = null;
  v6LimestoneMat.bumpScale = 0;
  v6LimestoneMat.aoMap = v6Suites.limestonePaversSuite.ormMap;
  v6LimestoneMat.aoMapIntensity = 0.65;
  v6LimestoneMat.roughnessMap = v6Suites.limestonePaversSuite.ormMap;
  v6LimestoneMat.metalnessMap = v6Suites.limestonePaversSuite.ormMap;
  v6LimestoneMat.roughness = 1.0;
  v6LimestoneMat.metalness = 0.0;
  v6LimestoneMat.envMapIntensity = 0.28;
  v6LimestoneMat.userData.v7PomScale = 0.012;
  v6LimestoneMat.needsUpdate = true;

  lib.roadAsphalt = v6RoadMat;
  lib.asphaltRoad = v6RoadMat;
  lib.bikeLaneGreen = v6RoadMat;
  lib.brickPath = v6LimestoneMat;
  lib.sandstonePavers = v6LimestoneMat;
  lib.limestonePavers = v6LimestoneMat;
  lib.visitorHexPavers = v3CampusMaterials.materials.visitorHexPavers;
  lib.boardFormedConcrete = v3CampusMaterials.materials.boardFormedConcrete;
  lib.concreteWall = v3CampusMaterials.materials.boardFormedConcrete;
  lib.brushedStainlessBollard = v3CampusMaterials.materials.brushedStainlessBollard;
  lib.canopyWhiteSteelTruss = v3CampusMaterials.materials.canopyWhiteSteelTruss;

  // Tag calibrated POM relief depth (`<= 28m` gated) on all 5 required architectural/botanical surface families:
  // (1) Interlocking hex pavers, (2) Indiana limestone joints, (3) Board-formed concrete,
  // (4) Bay View dragonscale solar shingles, and (5) Coast Redwood bark.
  lib.visitorHexPavers.userData.v7PomScale = 0.011;
  lib.limestonePavers.userData.v7PomScale = 0.012;
  lib.stanLimestonePlinth.userData.v7PomScale = 0.011;
  lib.boardFormedConcrete.userData.v7PomScale = 0.012;
  lib.architecturalConcretePier.userData.v7PomScale = 0.012;
  lib.canopyLimestonePier.userData.v7PomScale = 0.011;
  lib.concretePath.userData.v7PomScale = 0.009;
  lib.dragonscaleTile.userData.v7PomScale = 0.016;
  lib.gradientShell.userData.v7PomScale = 0.016;
  lib.canopySilverDragonscale.userData.v7PomScale = 0.016;
  lib.redwoodBark.userData.v7PomScale = 0.020;

  // Tag building glass curtain walls & glazed roofs for crisp Fresnel sky/tree-horizon reflections (Section 4B.d)
  for (const glassMat of [
    lib.curtainGlass,
    lib.canopySkyGlass,
    lib.canopyClerestoryGlow,
    lib.clerestoryGlow,
    lib.gymArchitecturalGlass,
    lib.breakableTemperedGlass,
  ]) {
    if (glassMat) glassMat.userData.v7GlassReflectBoost = 1.0;
  }
  if (lib.shatterGlassShard) {
    applyTemperedGlassShardGlintShader(lib.shatterGlassShard);
  }
  for (const pvMat of [lib.dragonscaleTile, lib.gradientShell, lib.canopySilverDragonscale, lib.solarPanelBlue]) {
    if (pvMat) pvMat.userData.v7GlassReflectBoost = 0.48;
  }
  // Keep Pelican plumage/beak/attire untouched by campus building ground-bounce so #ECE8DF stays crisp
  for (const key of Object.keys(lib)) {
    const m = lib[key];
    if (!m || !m.isMaterial) continue;
    if (m.normalMap && m.bumpMap) {
      m.bumpMap = null;
      m.bumpScale = 0;
    }
    if (/^(pelican|cap|scarf|gbike|baguette|mackerel|reflector)/.test(key)) {
      m.userData.v7SkipWorldCohesion = true;
    }
  }

  lib.textures.roadAsphaltMap = v6Suites.asphaltSuite.map;
  lib.textures.roadAsphaltNormal = v6Suites.asphaltSuite.normalMap;
  lib.textures.roadAsphaltRoughness = v6Suites.asphaltSuite.ormMap;
  lib.textures.brickMap = v6Suites.limestonePaversSuite.map;
  lib.textures.sandstonePaversMap = v6Suites.limestonePaversSuite.map;
  lib.textures.sandstonePaversNormal = v6Suites.limestonePaversSuite.normalMap;
  lib.textures.sandstonePaversRoughness = v6Suites.limestonePaversSuite.ormMap;
  lib.textures.visitorHexPaversMap = v6Suites.visitorHexPaversSuite.map;
  lib.textures.visitorHexPaversNormal = v6Suites.visitorHexPaversSuite.normalMap;
  lib.textures.visitorHexPaversRoughness = v6Suites.visitorHexPaversSuite.ormMap;

  // Apply shared V7 World-Cohesion + POM shader hook idempotently across all campus PBR materials
  applyWorldCohesionShaderHook(lib);

  return lib;
}

/**
 * Shared global uniforms (`O(1)` per-frame update, `0` heap allocations!) driving the V7 World-Cohesion
 * & Parallax Occlusion Mapping `onBeforeCompile` hook across all campus PBR materials.
 */
export const WORLD_COHESION_SHARED_UNIFORMS = {
  uV7Time: { value: 0.0 },
  uV7GroundY: { value: 0.0 },
  uV7SunDir: { value: new THREE.Vector3(-0.66, 0.34, 0.67).normalize() },
  uV7BounceColor: { value: new THREE.Color("#D49B6A") }, // warm sunlit plaza limestone/terracotta ground bounce
  uV7SkyZenithColor: { value: new THREE.Color("#5E8EC4") },
  uV7SkyHorizonColor: { value: new THREE.Color("#F2D2A2") },
  uV7TreeCanopyColor: { value: new THREE.Color("#2C4026") },
  uV7HazeRayleighColor: { value: new THREE.Color("#A8C0DA") },
  uV7HazeMieColor: { value: new THREE.Color("#F6CF92") },
  uV7CohesionEnabled: { value: 1.0 },
};

/**
 * Zero-allocation per-frame updater for `WORLD_COHESION_SHARED_UNIFORMS`.
 */
export function updateWorldCohesionUniforms(opts = {}) {
  if (Number.isFinite(opts.timeSec)) {
    WORLD_COHESION_SHARED_UNIFORMS.uV7Time.value = opts.timeSec;
  } else if (Number.isFinite(opts.elapsedSec)) {
    WORLD_COHESION_SHARED_UNIFORMS.uV7Time.value = opts.elapsedSec;
  }
  if (Number.isFinite(opts.groundY)) {
    WORLD_COHESION_SHARED_UNIFORMS.uV7GroundY.value = opts.groundY;
  }
  if (opts.sunDir && Number.isFinite(opts.sunDir.x)) {
    WORLD_COHESION_SHARED_UNIFORMS.uV7SunDir.value.copy(opts.sunDir).normalize();
  }
  if (typeof opts.enabled === "boolean") {
    WORLD_COHESION_SHARED_UNIFORMS.uV7CohesionEnabled.value = opts.enabled ? 1.0 : 0.0;
  }
  return WORLD_COHESION_SHARED_UNIFORMS;
}

/**
 * Section 4B — Idempotent, WebGL2-safe (`pow(max(x, 1e-4), y)` guarded!) `onBeforeCompile` hook
 * applicable to a single `THREE.Material`, an `Array`/`Set`, a material dictionary (`createMaterialLibrary()`),
 * or a `THREE.Object3D` hierarchy (also supports `(THREE_Ignored, target, options)` signature).
 *
 * Injects:
 *   - View-ray Steep Parallax Occlusion Mapping (`<= 28m`, 0 extra texture samplers via `roughnessMap.a`),
 *   - (a) Vertical warm plaza/terracotta ground-bounce tinting on the lower `2.5m` of surfaces,
 *   - (b) World-space contact/crevice cavity darkening near `groundY`,
 *   - (c) Procedural wind-drifting dappled tree-canopy shadow gobos along campus bike lanes,
 *   - (d) Crisp Fresnel sky/tree-horizon specular reflections on building glass curtain walls, and
 *   - (e) Unified height-aware golden-hour Rayleigh/Mie atmospheric perspective.
 */
export function applyWorldCohesionShaderHook(arg1, arg2 = {}, arg3 = {}) {
  const isThreeFirst = Boolean(
    arg1 &&
      arg1.MeshStandardMaterial &&
      arg2 &&
      (typeof arg2 === "object" || Array.isArray(arg2))
  );
  const target = isThreeFirst ? arg2 : arg1;
  const options = (isThreeFirst ? arg3 : arg2) || {};
  if (!target) {
    return { materialsHooked: 0 };
  }

  const visitedObjs = new Set();
  const visitedMats = new Set();
  let materialsHooked = 0;

  const hookSingleMaterial = (mat) => {
    if (!mat || !mat.isMaterial || visitedMats.has(mat)) return;
    visitedMats.add(mat);

    // Always enforce zero redundant bumpMap when tangent-space normalMap is already bound
    if (mat.normalMap && mat.bumpMap) {
      mat.bumpMap = null;
      mat.bumpScale = 0;
    }

    if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) return;
    const isTpuPackageMat = /Mat_TPU_8i_Package|TPU_8i/i.test(mat.name || "");
    if ((mat.userData?.v7SkipWorldCohesion || isTpuPackageMat || mat.userData?.__v7ShardGlintApplied) && !options.force) {
      if (mat.userData?.__v7WorldCohesionUniforms?.uV7MatEnabled) {
        mat.userData.__v7WorldCohesionUniforms.uV7MatEnabled.value = 0.0;
      }
      return;
    }
    if (mat.userData?.__v5StanPatinaApplied) return;

    const pomScale = Number.isFinite(options.pomScale)
      ? options.pomScale
      : Number(mat.userData?.v7PomScale || 0.0);
    const glassBoost = Number.isFinite(options.glassReflectBoost)
      ? options.glassReflectBoost
      : Number(mat.userData?.v7GlassReflectBoost || 0.0);
    const bounceWeight = Number.isFinite(options.bounceWeight)
      ? options.bounceWeight
      : Number.isFinite(mat.userData?.v7BounceWeight)
      ? mat.userData.v7BounceWeight
      : 1.0;

    if (mat.userData.__v7WorldCohesionApplied) {
      const u = mat.userData.__v7WorldCohesionUniforms;
      if (u) {
        u.uV7PomScale.value = pomScale;
        u.uV7GlassReflectBoost.value = glassBoost;
        u.uV7BounceWeight.value = bounceWeight;
        if (u.uV7MatEnabled) u.uV7MatEnabled.value = 1.0;
      }
      return;
    }

    const perMatUniforms = {
      uV7PomScale: { value: pomScale },
      uV7GlassReflectBoost: { value: glassBoost },
      uV7BounceWeight: { value: bounceWeight },
      uV7MatEnabled: { value: 1.0 },
    };
    mat.userData.__v7WorldCohesionApplied = true;
    mat.userData.__v7WorldCohesionUniforms = perMatUniforms;

    const hasPom = Boolean(pomScale > 0.0001 && mat.roughnessMap && mat.normalMap);
    mat.userData.v7PomEnabled = hasPom;
    const v7KeySuffix = hasPom ? "v7_world_cohesion_pom_v1" : "v7_world_cohesion_std_v1";
    const prevOnBeforeCompile = mat.onBeforeCompile;
    const prevCacheKeyFn = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;

    mat.customProgramCacheKey = function customProgramCacheKeyV7() {
      const base = prevCacheKeyFn ? prevCacheKeyFn() : "";
      if (mat.userData?.v7SkipWorldCohesion && !options.force) {
        return base ? `${base}|v7_cohesion_skipped` : "v7_cohesion_skipped";
      }
      return base ? `${base}|${v7KeySuffix}` : v7KeySuffix;
    };

    mat.onBeforeCompile = (shader, renderer) => {
      if (typeof prevOnBeforeCompile === "function") {
        prevOnBeforeCompile(shader, renderer);
      }
      if ((mat.userData?.v7SkipWorldCohesion || /Mat_TPU_8i_Package|TPU_8i/i.test(mat.name || "")) && !options.force) {
        perMatUniforms.uV7MatEnabled.value = 0.0;
        return;
      }
      shader.uniforms.uV7Time = WORLD_COHESION_SHARED_UNIFORMS.uV7Time;
      shader.uniforms.uV7GroundY = WORLD_COHESION_SHARED_UNIFORMS.uV7GroundY;
      shader.uniforms.uV7SunDir = WORLD_COHESION_SHARED_UNIFORMS.uV7SunDir;
      shader.uniforms.uV7BounceColor = WORLD_COHESION_SHARED_UNIFORMS.uV7BounceColor;
      shader.uniforms.uV7SkyZenithColor = WORLD_COHESION_SHARED_UNIFORMS.uV7SkyZenithColor;
      shader.uniforms.uV7SkyHorizonColor = WORLD_COHESION_SHARED_UNIFORMS.uV7SkyHorizonColor;
      shader.uniforms.uV7TreeCanopyColor = WORLD_COHESION_SHARED_UNIFORMS.uV7TreeCanopyColor;
      shader.uniforms.uV7HazeRayleighColor = WORLD_COHESION_SHARED_UNIFORMS.uV7HazeRayleighColor;
      shader.uniforms.uV7HazeMieColor = WORLD_COHESION_SHARED_UNIFORMS.uV7HazeMieColor;
      shader.uniforms.uV7CohesionEnabled = WORLD_COHESION_SHARED_UNIFORMS.uV7CohesionEnabled;
      shader.uniforms.uV7PomScale = perMatUniforms.uV7PomScale;
      shader.uniforms.uV7GlassReflectBoost = perMatUniforms.uV7GlassReflectBoost;
      shader.uniforms.uV7BounceWeight = perMatUniforms.uV7BounceWeight;
      shader.uniforms.uV7MatEnabled = perMatUniforms.uV7MatEnabled;

      if (!shader.vertexShader.includes("vV7WorldPos")) {
        shader.vertexShader = shader.vertexShader.replace(
          "#include <common>",
          `varying vec3 vV7WorldPos;\n#include <common>`
        );
        shader.vertexShader = shader.vertexShader.replace(
          "#include <worldpos_vertex>",
          `#include <worldpos_vertex>
          {
            vec4 v7Wp = vec4( transformed, 1.0 );
            #ifdef USE_BATCHING
              v7Wp = batchingMatrix * v7Wp;
            #endif
            #ifdef USE_INSTANCING
              v7Wp = instanceMatrix * v7Wp;
            #endif
            vV7WorldPos = ( modelMatrix * v7Wp ).xyz;
          }`
        );
      }

      if (!shader.fragmentShader.includes("uV7CohesionEnabled")) {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <common>",
          `varying vec3 vV7WorldPos;
          uniform float uV7Time;
          uniform float uV7GroundY;
          uniform vec3 uV7SunDir;
          uniform vec3 uV7BounceColor;
          uniform vec3 uV7SkyZenithColor;
          uniform vec3 uV7SkyHorizonColor;
          uniform vec3 uV7TreeCanopyColor;
          uniform vec3 uV7HazeRayleighColor;
          uniform vec3 uV7HazeMieColor;
          uniform float uV7CohesionEnabled;
          uniform float uV7PomScale;
          uniform float uV7GlassReflectBoost;
          uniform float uV7BounceWeight;
          uniform float uV7MatEnabled;

          float v7BikeLaneCorridorMask( vec2 xz ) {
            // Protected tree-lined campus bikeways (Charleston z=76, Amphitheatre z=-18, North Bayshore z=-86,
            // N Shoreline x=0, Googleplex West Ave x=-118)
            float mCharleston = smoothstep( 12.5, 4.2, abs( xz.y - 76.0 ) ) * step( -198.0, xz.x ) * step( xz.x, 168.0 );
            float mAmphi = smoothstep( 12.5, 4.2, abs( xz.y + 18.0 ) ) * step( -198.0, xz.x ) * step( xz.x, 168.0 );
            float mNorth = smoothstep( 11.0, 3.4, abs( xz.y + 86.0 ) ) * step( -4.0, xz.x ) * step( xz.x, 168.0 );
            float mShoreline = smoothstep( 12.5, 4.2, abs( xz.x ) ) * step( -90.0, xz.y ) * step( xz.y, 124.0 );
            float mWest = smoothstep( 12.0, 3.8, abs( xz.x + 118.0 ) ) * step( -74.0, xz.y ) * step( xz.y, 88.0 );
            // Modulate into natural roadside oak/redwood canopy clusters along the boulevards
            float treeCluster = smoothstep( -0.15, 0.55, sin( xz.x * 0.145 + 0.7 ) * cos( xz.y * 0.135 - 0.4 ) + 0.35 * sin( ( xz.x + xz.y ) * 0.08 ) );
            return clamp( max( max( mCharleston, mAmphi ), max( mNorth, max( mShoreline, mWest ) ) ) * ( 0.38 + 0.62 * treeCluster ), 0.0, 1.0 );
          }

          float v7DappledCanopyGobo( vec2 xz, float tSec ) {
            vec2 driftA = xz * 0.46 + vec2( tSec * 0.19, -tSec * 0.13 );
            vec2 driftB = xz * 0.92 + vec2( -tSec * 0.27, tSec * 0.21 );
            float leafA = sin( driftA.x ) * cos( driftA.y ) + 0.55 * sin( driftA.x * 1.7 - driftA.y * 1.3 );
            float leafB = cos( driftB.x * 1.15 + driftB.y * 0.85 );
            float gap = smoothstep( -0.25, 0.48, leafA * 0.65 + leafB * 0.35 );
            return 1.0 - gap;
          }
          #include <common>`
        );

        if (hasPom) {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <logdepthbuf_fragment>",
            `#include <logdepthbuf_fragment>
            vec2 v7PomDelta = vec2( 0.0 );
            #if defined( USE_ROUGHNESSMAP ) && defined( USE_NORMALMAP_TANGENTSPACE )
            {
              vec2 v7UvDx = dFdx( vRoughnessMapUv );
              vec2 v7UvDy = dFdy( vRoughnessMapUv );
              float v7CamDist = length( vViewPosition );
              if ( uV7PomScale > 0.0001 && v7CamDist < 28.0 ) {
                float v7FaceDir = gl_FrontFacing ? 1.0 : -1.0;
                #ifdef FLAT_SHADED
                  vec3 v7GeoN = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );
                #else
                  vec3 v7GeoN = normalize( vNormal );
                  #ifdef DOUBLE_SIDED
                    v7GeoN *= v7FaceDir;
                  #endif
                #endif
                #ifdef USE_TANGENT
                  mat3 v7Tbn = mat3( normalize( vTangent ), normalize( vBitangent ), v7GeoN );
                #else
                  mat3 v7Tbn = getTangentFrame( -vViewPosition, v7GeoN, vRoughnessMapUv );
                #endif
                #ifdef DOUBLE_SIDED
                  v7Tbn[0] *= v7FaceDir;
                  v7Tbn[1] *= v7FaceDir;
                #endif
                vec3 v7ViewDirV = normalize( vViewPosition + vec3( 0.0, 0.0, 1e-6 ) );
                vec3 v7ViewTS = normalize( transpose( v7Tbn ) * v7ViewDirV + vec3( 0.0, 0.0, 1e-6 ) );
                float v7DistFade = 1.0 - smoothstep( 18.0, 28.0, v7CamDist );
                float v7NumLayers = mix( 3.0, 5.0, 1.0 - clamp( abs( v7ViewTS.z ), 0.0, 1.0 ) );
                float v7LayerStep = 1.0 / v7NumLayers;
                vec2 v7FullShift = ( -v7ViewTS.xy / max( abs( v7ViewTS.z ) + 0.34, 0.36 ) ) * ( uV7PomScale * v7DistFade );
                vec2 v7DeltaUv = v7FullShift * v7LayerStep;
                vec2 v7CurUv = vRoughnessMapUv;
                float v7CurDepth = 1.0 - textureGrad( roughnessMap, v7CurUv, v7UvDx, v7UvDy ).a;
                float v7CurLayer = 0.0;
                for ( int i = 0; i < 5; i++ ) {
                  if ( float( i ) >= v7NumLayers || v7CurLayer >= v7CurDepth ) break;
                  v7CurUv += v7DeltaUv;
                  v7CurDepth = 1.0 - textureGrad( roughnessMap, v7CurUv, v7UvDx, v7UvDy ).a;
                  v7CurLayer += v7LayerStep;
                }
                if ( v7CurLayer > 0.0 ) {
                  vec2 v7PrevUv = v7CurUv - v7DeltaUv;
                  float v7Before = max( 0.0, ( 1.0 - textureGrad( roughnessMap, v7PrevUv, v7UvDx, v7UvDy ).a ) - ( v7CurLayer - v7LayerStep ) );
                  float v7After = max( 0.0, v7CurLayer - v7CurDepth );
                  float v7Frac = v7Before / max( v7Before + v7After, 1e-4 );
                  vec2 v7FinalUv = mix( v7PrevUv, v7CurUv, v7Frac );
                  v7PomDelta = clamp( v7FinalUv - vRoughnessMapUv, vec2( -0.035 ), vec2( 0.035 ) );
                }
              }
            }
            #endif`
          );

          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <map_fragment>",
              THREE.ShaderChunk.map_fragment.replace(
                "texture2D( map, vMapUv )",
                "texture2D( map, vMapUv + v7PomDelta )"
              )
            )
            .replace(
              "#include <roughnessmap_fragment>",
              THREE.ShaderChunk.roughnessmap_fragment.replace(
                "texture2D( roughnessMap, vRoughnessMapUv )",
                "texture2D( roughnessMap, vRoughnessMapUv + v7PomDelta )"
              )
            )
            .replace(
              "#include <metalnessmap_fragment>",
              THREE.ShaderChunk.metalnessmap_fragment.replace(
                "texture2D( metalnessMap, vMetalnessMapUv )",
                "texture2D( metalnessMap, vMetalnessMapUv + v7PomDelta )"
              )
            )
            .replace(
              "#include <normal_fragment_maps>",
              THREE.ShaderChunk.normal_fragment_maps.replace(
                /texture2D\(\s*normalMap,\s*vNormalMapUv\s*\)/g,
                "texture2D( normalMap, vNormalMapUv + v7PomDelta )"
              )
            )
            .replace(
              "#include <aomap_fragment>",
              THREE.ShaderChunk.aomap_fragment.replace(
                "texture2D( aoMap, vAoMapUv )",
                "texture2D( aoMap, vAoMapUv + v7PomDelta )"
              )
            );
        }

        // Inject Section 4B (a)-(e) World-Cohesion shading right before #include <opaque_fragment>
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <opaque_fragment>",
          `if ( uV7CohesionEnabled > 0.5 && uV7MatEnabled > 0.5 ) {
            vec3 v7WorldN = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz + vec3( 0.0, 1e-6, 0.0 ) );
            vec3 v7WorldV = normalize( cameraPosition - vV7WorldPos + vec3( 0.0, 1e-6, 0.0 ) );
            float v7RelY = vV7WorldPos.y - uV7GroundY;
            float v7Dist = length( cameraPosition - vV7WorldPos );

            // (a) Vertical warm plaza/terracotta ground-bounce tinting on lower 2.5m of surfaces
            float v7BounceHeight = 1.0 - smoothstep( 0.0, 2.5, max( v7RelY, 0.0 ) );
            float v7VertDownMask = clamp( 0.72 - v7WorldN.y * 0.72, 0.0, 1.0 );
            float v7BounceFactor = v7BounceHeight * v7VertDownMask * uV7BounceWeight * 0.15;
            outgoingLight += diffuseColor.rgb * uV7BounceColor * v7BounceFactor;

            // (b) World-space contact/crevice cavity darkening near groundY (curbs, wall bases, tree roots, planters)
            float v7ContactBand = 1.0 - smoothstep( 0.0, 0.30, abs( v7RelY ) );
            float v7CreviceMask = clamp( 1.0 - max( v7WorldN.y, 0.0 ) * 0.90, 0.0, 1.0 );
            float v7CavityOcc = 1.0 - v7ContactBand * v7CreviceMask * 0.24;
            outgoingLight *= v7CavityOcc;

            // (c) Procedural wind-drifting dappled tree-canopy shadow gobos along campus bike lanes
            float v7LaneMask = v7BikeLaneCorridorMask( vV7WorldPos.xz ) * ( 1.0 - smoothstep( 2.4, 5.2, max( v7RelY, 0.0 ) ) );
            if ( v7LaneMask > 0.005 ) {
              float v7Gobo = v7DappledCanopyGobo( vV7WorldPos.xz, uV7Time );
              float v7UpSunWeight = clamp( v7WorldN.y * 0.65 + 0.35, 0.15, 1.0 );
              float v7DappleShade = 1.0 - v7LaneMask * v7Gobo * v7UpSunWeight * 0.21;
              vec3 v7CoolLeafShadow = mix( vec3( 1.0 ), vec3( 0.86, 0.92, 1.02 ), v7LaneMask * v7Gobo * 0.45 );
              outgoingLight *= v7DappleShade * v7CoolLeafShadow;
            }

            // (d) Crisp Fresnel sky / tree-horizon specular reflections on building glass curtain walls
            if ( uV7GlassReflectBoost > 0.001 ) {
              float v7NdotV = clamp( dot( v7WorldN, v7WorldV ), 0.0, 1.0 );
              float v7Fresnel = 0.04 + 0.96 * pow( max( 1.0 - v7NdotV, 1e-4 ), 4.2 );
              vec3 v7ReflDir = reflect( -v7WorldV, v7WorldN );
              float v7SkyT = smoothstep( 0.02, 0.58, max( v7ReflDir.y, 0.0 ) );
              vec3 v7SkyRefl = mix( uV7SkyHorizonColor, uV7SkyZenithColor, v7SkyT );
              float v7TreeLine = smoothstep( 0.20, -0.06, v7ReflDir.y ) * ( 0.65 + 0.35 * sin( v7ReflDir.x * 11.0 + v7ReflDir.z * 9.0 ) );
              vec3 v7EnvRefl = mix( v7SkyRefl, uV7TreeCanopyColor, clamp( v7TreeLine * 0.68, 0.0, 0.72 ) );
              float v7SunGlint = pow( max( dot( v7ReflDir, normalize( uV7SunDir ) ), 1e-4 ), 48.0 ) * 0.55;
              outgoingLight += ( v7EnvRefl * v7Fresnel * 0.46 + uV7HazeMieColor * v7SunGlint ) * uV7GlassReflectBoost;
            }

            // (e) Unified height-aware golden-hour Rayleigh/Mie atmospheric perspective
            float v7DistFactor = smoothstep( 26.0, 255.0, v7Dist );
            if ( v7DistFactor > 0.001 ) {
              float v7AltDecay = exp( -max( v7RelY, 0.0 ) * 0.026 );
              vec3 v7RayDir = normalize( vV7WorldPos - cameraPosition + vec3( 0.0, 1e-6, 0.0 ) );
              float v7CosTheta = max( dot( v7RayDir, normalize( uV7SunDir ) ), 0.0 );
              float v7MiePhase = pow( max( v7CosTheta, 1e-4 ), 5.0 );
              vec3 v7Inscatter = mix( uV7HazeRayleighColor, uV7HazeMieColor, clamp( 0.22 + v7MiePhase * 0.68, 0.0, 0.92 ) );
              float v7HazeAlpha = clamp( v7DistFactor * v7AltDecay * 0.30, 0.0, 0.34 );
              outgoingLight = mix( outgoingLight, v7Inscatter, v7HazeAlpha );
            }
          }
          #include <opaque_fragment>`
        );
      }
    };

    mat.needsUpdate = true;
    materialsHooked++;
  };

  const visit = (item) => {
    if (!item || typeof item !== "object" || visitedObjs.has(item)) return;
    visitedObjs.add(item);

    if (item.isMaterial) {
      hookSingleMaterial(item);
      return;
    }
    if (Array.isArray(item) || item instanceof Set) {
      for (const sub of item) visit(sub);
      return;
    }
    if (typeof item.traverse === "function") {
      item.traverse((node) => {
        if (!node || !node.material) return;
        if (Array.isArray(node.material)) {
          for (const m of node.material) hookSingleMaterial(m);
        } else {
          hookSingleMaterial(node.material);
        }
      });
      return;
    }
    // Plain dictionary (e.g. `createMaterialLibrary()` return object) or wrapper
    for (const key of Object.keys(item)) {
      if (key === "textures" || key === "_textures" || key === "_suites" || key === "readyPromise") continue;
      const val = item[key];
      if (!val || typeof val !== "object") continue;
      if (val.isMaterial || typeof val.traverse === "function" || Array.isArray(val)) {
        visit(val);
      } else if (key === "materials") {
        visit(val);
      }
    }
  };

  visit(target);
  return { materialsHooked };
}

/**
 * Calibrates & injects a WebGL2-safe (`pow(max(x, 1e-4), y)` guarded!) Fresnel bevel-edge +
 * tumbling solar-facet specular glint shader on tempered glass shard materials (`MAJOR-1.3`),
 * so shattered glass panes sparkle like real low-iron architectural glass instead of matte confetti.
 */
export function applyTemperedGlassShardGlintShader(material, options = {}) {
  if (!material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)) {
    return material;
  }
  if (!options.preserveBaseParams) {
    if (material.color) material.color.set(options.color || "#cde6f8");
    if (material.emissive) {
      material.emissive.set("#000000");
      material.emissiveIntensity = 0.0;
    }
    material.roughness = Number.isFinite(options.roughness) ? options.roughness : 0.035;
    material.metalness = Number.isFinite(options.metalness) ? options.metalness : 0.14;
    material.transparent = true;
    material.opacity = Number.isFinite(options.opacity) ? options.opacity : 0.38;
    material.envMapIntensity = Number.isFinite(options.envMapIntensity) ? options.envMapIntensity : 1.65;
    material.side = THREE.DoubleSide;
    if (material.isMeshPhysicalMaterial) {
      material.clearcoat = 1.0;
      material.clearcoatRoughness = 0.02;
    }
  }
  material.userData = material.userData || {};
  material.userData.v7SkipWorldCohesion = true;
  if (material.userData.__v7WorldCohesionUniforms?.uV7MatEnabled) {
    material.userData.__v7WorldCohesionUniforms.uV7MatEnabled.value = 0.0;
  }

  const sparkleGain = Number.isFinite(options.sparkleGain) ? options.sparkleGain : 1.0;
  if (material.userData.__v7ShardGlintApplied) {
    if (material.userData.__v7ShardGlintUniforms) {
      material.userData.__v7ShardGlintUniforms.uV7ShardSparkleGain.value = sparkleGain;
    }
    return material;
  }

  const shardUniforms = {
    uV7ShardSkyColor: { value: new THREE.Color(options.skyColor || "#D8EEFF") },
    uV7ShardSunColor: { value: new THREE.Color(options.sunColor || "#FFF3D8") },
    uV7ShardSparkleGain: { value: sparkleGain },
  };
  material.userData.__v7ShardGlintApplied = true;
  material.userData.__v7ShardGlintUniforms = shardUniforms;

  const prevOnBeforeCompile = material.onBeforeCompile;
  const prevCacheKeyFn = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : null;
  material.customProgramCacheKey = function customProgramCacheKeyShardV7() {
    const base = prevCacheKeyFn ? prevCacheKeyFn() : "";
    return base ? `${base}|v7_tempered_shard_glint_v1` : "v7_tempered_shard_glint_v1";
  };

  material.onBeforeCompile = (shader, renderer) => {
    if (typeof prevOnBeforeCompile === "function") {
      prevOnBeforeCompile(shader, renderer);
    }
    shader.uniforms.uV7ShardSunDir = WORLD_COHESION_SHARED_UNIFORMS.uV7SunDir;
    shader.uniforms.uV7ShardSkyColor = shardUniforms.uV7ShardSkyColor;
    shader.uniforms.uV7ShardSunColor = shardUniforms.uV7ShardSunColor;
    shader.uniforms.uV7ShardSparkleGain = shardUniforms.uV7ShardSparkleGain;

    if (!shader.vertexShader.includes("vV7ShardWorldPos")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `varying vec3 vV7ShardWorldPos;\n#include <common>`
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        {
          vec4 v7ShWp = vec4( transformed, 1.0 );
          #ifdef USE_BATCHING
            v7ShWp = batchingMatrix * v7ShWp;
          #endif
          #ifdef USE_INSTANCING
            v7ShWp = instanceMatrix * v7ShWp;
          #endif
          vV7ShardWorldPos = ( modelMatrix * v7ShWp ).xyz;
        }`
      );
    }

    if (!shader.fragmentShader.includes("uV7ShardSparkleGain")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `varying vec3 vV7ShardWorldPos;
        uniform vec3 uV7ShardSunDir;
        uniform vec3 uV7ShardSkyColor;
        uniform vec3 uV7ShardSunColor;
        uniform float uV7ShardSparkleGain;
        #include <common>`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `{
          vec3 v7ShWorldN = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz + vec3( 0.0, 1e-6, 0.0 ) );
          vec3 v7ShWorldV = normalize( cameraPosition - vV7ShardWorldPos + vec3( 0.0, 1e-6, 0.0 ) );
          float v7ShNdotV = clamp( abs( dot( geometryNormal, geometryViewDir ) ), 0.0, 1.0 );
          float v7ShFresnel = pow( max( 1.0 - v7ShNdotV, 1e-4 ), 2.8 );
          float v7ShBevelRim = pow( max( 1.0 - v7ShNdotV, 1e-4 ), 5.2 );
          vec3 v7ShRefl = reflect( -v7ShWorldV, v7ShWorldN );
          vec3 v7ShSun = normalize( uV7ShardSunDir + vec3( 0.0, 1e-6, 0.0 ) );
          float v7ShSunDot = clamp( abs( dot( v7ShRefl, v7ShSun ) ), 0.0, 1.0 );
          float v7ShSunGlint = pow( max( v7ShSunDot, 1e-4 ), 26.0 ) * 3.2 + pow( max( v7ShSunDot, 1e-4 ), 7.0 ) * 0.45;
          vec3 v7ShSky = mix( vec3( 0.80, 0.90, 0.98 ), uV7ShardSkyColor, clamp( v7ShRefl.y * 0.5 + 0.5, 0.0, 1.0 ) );
          outgoingLight += ( v7ShSky * ( v7ShFresnel * 1.15 + v7ShBevelRim * 1.45 ) + uV7ShardSunColor * v7ShSunGlint ) * uV7ShardSparkleGain;
          diffuseColor.a = clamp( diffuseColor.a * 0.58 + v7ShFresnel * 0.48 + min( v7ShSunGlint, 1.0 ) * 0.44, 0.16, 0.96 );
        }
        #include <opaque_fragment>`
      );
    }
  };

  material.needsUpdate = true;
  return material;
}

const _deplasticHsl = { h: 0, s: 0, l: 0 };

/**
 * Deterministically de-plasticizes GLB, InstancedMesh, Array-of-batches, or procedural prop hierarchies
 * (Bugdroid & dessert statues, Pink Flamingos, legacy V2 pinwheel masts/rotors, umbrellas, benches, planters) by:
 *   1. Enforcing architectural satin fiberglass / matte powder-coated aluminum roughness (`>= 0.68`, `>= 0.62` on poles),
 *   2. Stripping glossy toy-balloon clearcoat (`clearcoat = 0`) AND replacing glossy baked glTF ORM `roughnessMap` /
 *      `metalnessMap` slots with V7 Packed `ormMap` (`aoMap = roughnessMap = metalnessMap = ormMap`) + `bumpMap = null`,
 *   3. Binding `512x512` micro-grain `normalMap` + Packed `ormMap`, clamping `metalness <= 0.04` on non-metals and
 *      `envMapIntensity <= 0.34` (`<= 0.38`), and
 *   4. Desaturating hyper-neon RGB colors into the V6/V7 museum Google campus palette.
 */
export function deplasticizeCampusPropMaterials(arg1, arg2 = {}, arg3 = {}) {
  const isThreeFirst = Boolean(
    arg1 &&
      arg1.MeshStandardMaterial &&
      arg2 &&
      (typeof arg2.traverse === "function" || Array.isArray(arg2) || arg2.isMaterial)
  );
  const rootTarget = isThreeFirst ? arg2 : arg1;
  const options = (isThreeFirst ? arg3 : arg2) || {};
  if (!rootTarget) {
    return { meshesVisited: 0, materialsUpdated: 0 };
  }

  const minRoughness = Number.isFinite(options.minRoughness) ? Math.max(0.62, options.minRoughness) : 0.68;
  const maxDielectricEnv = Number.isFinite(options.maxDielectricEnv)
    ? Math.min(0.38, options.maxDielectricEnv)
    : 0.32;
  const desaturateScale = Number.isFinite(options.desaturateScale) ? options.desaturateScale : 0.84;
  const cloneMaterials = options.cloneMaterials !== false;

  const microGrain = getPropMicroGrainSuite();
  const clonedByUuid = new Map();
  const processedMats = new Set();
  const visitedTargets = new Set();
  let meshesVisited = 0;
  let materialsUpdated = 0;

  const tunePropMat = (srcMat, nodeName) => {
    if (!srcMat || (!srcMat.isMeshStandardMaterial && !srcMat.isMeshPhysicalMaterial)) {
      return srcMat;
    }
    // Leave transparent architectural glass, dedicated oxidized Stan bronze, & V7 glossy origami pinwheels intact
    if (srcMat.transparent && (srcMat.opacity ?? 1.0) < 0.82) {
      return srcMat;
    }
    const label = `${srcMat.name || ""} ${nodeName || ""}`;
    if (
      (/Stan_Bronze|Stan_Body/i.test(label) && !options.includeStanBronze) ||
      srcMat.userData?.preservePinwheelSpecular ||
      srcMat.userData?.v7SkipWorldCohesion ||
      srcMat.userData?.__v7ShardGlintApplied ||
      /V7_Pinwheel|Origami_Pinwheel|Mat_TPU_8i_Package|TPU_8i/i.test(label)
    ) {
      return srcMat;
    }
    if (cloneMaterials && clonedByUuid.has(srcMat.uuid)) {
      return clonedByUuid.get(srcMat.uuid);
    }

    const m = cloneMaterials ? srcMat.clone() : srcMat;
    if (cloneMaterials) {
      clonedByUuid.set(srcMat.uuid, m);
    }
    if (processedMats.has(m)) {
      return m;
    }
    processedMats.add(m);

    const isFabric = /Umbrella|CanopyFabric|Canvas|Awning|Parasol/i.test(label);
    const isWood = /Wood|Cedar|Timber|Slat|Bench|Cart/i.test(label);
    const isPinwheelRotor = /Rotor|Pinwheel.*Blade|Petal/i.test(label);
    const isAnodizedMetal =
      !isFabric &&
      !isWood &&
      !isPinwheelRotor &&
      ((!m.metalnessMap && (m.metalness ?? 0.0) >= 0.48) || /Steel|Alum|Mast|Pole|Metal|Frame/i.test(label));

    if (m.isMeshPhysicalMaterial) {
      m.clearcoat = 0.0;
      m.clearcoatRoughness = 1.0;
      if ("sheen" in m) m.sheen = 0.0;
      if ("iridescence" in m) m.iridescence = 0.0;
      if ("specularIntensity" in m) m.specularIntensity = Math.min(0.45, m.specularIntensity ?? 0.45);
    }

    const baseName = m.name || "CampusProp";
    if (!/Planter|Boulder|Umbrella/i.test(baseName)) {
      m.name = isFabric ? `${baseName}_Umbrella_V7` : `${baseName}_Planter_V7`;
    }

    if (isFabric) {
      if (!m.normalMap) {
        m.normalMap = microGrain.canvasNormal;
        m.normalScale = new THREE.Vector2(0.58, 0.58);
      }
      m.aoMap = microGrain.canvasOrm;
      m.aoMapIntensity = 0.40;
      m.roughnessMap = microGrain.canvasOrm;
      m.metalnessMap = microGrain.canvasOrm;
      m.roughness = Math.max(0.84, m.roughness ?? 0.88);
      m.metalness = 0.0;
      m.envMapIntensity = Math.min(m.envMapIntensity ?? 0.24, 0.26);
    } else if (isWood) {
      if (!m.normalMap) {
        m.normalMap = microGrain.cedarNormal;
        m.normalScale = new THREE.Vector2(0.65, 0.65);
      }
      m.aoMap = microGrain.cedarOrm;
      m.aoMapIntensity = 0.45;
      m.roughnessMap = microGrain.cedarOrm;
      m.metalnessMap = microGrain.cedarOrm;
      m.roughness = Math.max(0.76, m.roughness ?? 0.84);
      m.metalness = 0.0;
      m.envMapIntensity = Math.min(m.envMapIntensity ?? 0.30, 0.34);
    } else if (isAnodizedMetal) {
      if (!m.normalMap) {
        m.normalMap = microGrain.steelNormal;
        m.normalScale = new THREE.Vector2(0.36, 0.36);
      }
      m.aoMap = microGrain.fiberglassUnitOrm;
      m.aoMapIntensity = 0.38;
      m.roughnessMap = microGrain.fiberglassUnitOrm;
      m.metalnessMap = microGrain.fiberglassUnitOrm;
      m.roughness = Math.max(0.62, m.roughness ?? 0.64);
      m.metalness = Math.min(0.26, Math.max(0.08, m.metalness ?? 0.18));
      m.envMapIntensity = Math.min(m.envMapIntensity ?? 0.34, 0.38);
    } else {
      if (!m.normalMap) {
        m.normalMap = microGrain.fiberglassNormal;
        m.normalScale = new THREE.Vector2(0.42, 0.42);
      }
      m.aoMap = microGrain.fiberglassUnitOrm;
      m.aoMapIntensity = 0.40;
      m.roughnessMap = microGrain.fiberglassUnitOrm;
      m.metalnessMap = microGrain.fiberglassUnitOrm;
      m.roughness = Math.max(minRoughness, 0.68);
      m.metalness = Math.min(0.03, m.metalness ?? 0.0);
      m.envMapIntensity = Math.min(m.envMapIntensity ?? maxDielectricEnv, maxDielectricEnv);
    }

    // Remove redundant bumpMap whenever normalMap is bound
    if (m.normalMap && m.bumpMap) {
      m.bumpMap = null;
      m.bumpScale = 0;
    }

    if (m.color && !isAnodizedMetal) {
      m.color.getHSL(_deplasticHsl, THREE.SRGBColorSpace);
      if (_deplasticHsl.s > 0.48) {
        const nextS = Math.min(0.64, _deplasticHsl.s * desaturateScale);
        const nextL = THREE.MathUtils.clamp(_deplasticHsl.l * 0.94, 0.08, 0.84);
        m.color.setHSL(_deplasticHsl.h, nextS, nextL, THREE.SRGBColorSpace);
      }
    }

    if (m.emissive && (m.emissiveIntensity ?? 0.0) > 0.03) {
      m.emissiveIntensity = 0.02;
    }

    applyWorldCohesionShaderHook(m);
    m.needsUpdate = true;
    materialsUpdated++;
    return m;
  };

  const visitTarget = (item) => {
    if (!item || typeof item !== "object" || visitedTargets.has(item)) return;
    visitedTargets.add(item);

    if (Array.isArray(item) || item instanceof Set) {
      for (const sub of item) visitTarget(sub);
      return;
    }
    if (item.isMaterial) {
      tunePropMat(item, item.name || "");
      return;
    }
    if (typeof item.traverse === "function") {
      item.traverse((node) => {
        if (!node || !node.isMesh || !node.material) return;
        meshesVisited++;
        if (Array.isArray(node.material)) {
          node.material = node.material.map((mat) => tunePropMat(mat, node.name));
        } else {
          node.material = tunePropMat(node.material, node.name);
        }
      });
      return;
    }
    for (const key of ["inst", "mesh", "instancedMesh", "group", "root", "object", "scene"]) {
      if (item[key]) visitTarget(item[key]);
    }
    if (item.material) {
      if (Array.isArray(item.material)) {
        item.material = item.material.map((mat) => tunePropMat(mat, item.name || ""));
      } else {
        item.material = tunePropMat(item.material, item.name || "");
      }
    }
  };

  visitTarget(rootTarget);
  return { meshesVisited, materialsUpdated };
}

/**
 * Converts a tileable single-channel `[0..255]` height buffer (`w x h`) into a tangent-space
 * OpenGL normal map `<canvas>` (`+X` right, `+Y` up, `+Z` out) using wrapped central differences.
 */
function buildNormalCanvasFromHeightBuffer(heightBuf, w, h, strength = 2.4) {
  const normCanvas = makeCanvas(w, h);
  const nCtx = normCanvas.getContext("2d");
  const img = nCtx.createImageData(w, h);
  const out = img.data;
  const wMask = w - 1;
  const hMask = h - 1;
  const inv255 = strength / 255.0;

  for (let y = 0; y < h; y++) {
    const yUp = ((y - 1) & hMask) * w;
    const yCur = y * w;
    const yDn = ((y + 1) & hMask) * w;
    for (let x = 0; x < w; x++) {
      const hL = heightBuf[yCur + ((x - 1) & wMask)];
      const hR = heightBuf[yCur + ((x + 1) & wMask)];
      const hU = heightBuf[yUp + x];
      const hD = heightBuf[yDn + x];
      const dx = (hL - hR) * inv255;
      const dy = (hU - hD) * inv255;
      const invLen = 127.5 / Math.sqrt(dx * dx + dy * dy + 1.0);
      const p = (yCur + x) * 4;
      out[p] = Math.max(0, Math.min(255, Math.round(127.5 + dx * invLen)));
      out[p + 1] = Math.max(0, Math.min(255, Math.round(127.5 + dy * invLen)));
      out[p + 2] = Math.max(0, Math.min(255, Math.round(127.5 + invLen)));
      out[p + 3] = 255;
    }
  }
  nCtx.putImageData(img, 0, 0);
  return normCanvas;
}

/**
 * Generates a tileable 2D smooth value-noise lookup table (`size x size`, power-of-two)
 * for fast multi-octave procedural PBR material synthesis.
 */
function buildTileableNoiseTable(size, seed) {
  const rng = createSeededRNG(seed);
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = rng();
  }
  return grid;
}

function sampleBilinearTile(grid, size, fx, fy) {
  const mask = size - 1;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3.0 - 2.0 * tx);
  const sy = ty * ty * (3.0 - 2.0 * ty);
  const ix0 = x0 & mask;
  const ix1 = (x0 + 1) & mask;
  const iy0 = (y0 & mask) * size;
  const iy1 = ((y0 + 1) & mask) * size;
  const a = grid[iy0 + ix0] + (grid[iy0 + ix1] - grid[iy0 + ix0]) * sx;
  const b = grid[iy1 + ix0] + (grid[iy1 + ix1] - grid[iy1 + ix0]) * sx;
  return a + (b - a) * sy;
}

function putGrayBufferToCanvas(buf, w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0, p = 0; i < buf.length; i++, p += 4) {
    const v = buf[i];
    d[p] = v;
    d[p + 1] = v;
    d[p + 2] = v;
    d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Builds an un-premultiplied RGBA `THREE.DataTexture` packing:
 *   `R` = Ambient Occlusion (`[0..255]`, `255` = unoccluded),
 *   `G` = Calibrated Roughness (`[0..255]`),
 *   `B` = Calibrated Metalness (`[0..255]`),
 *   `A` = Normalized Surface Height (`[0..255]`, used by view-ray POM within `<= 28m`).
 * Using `THREE.DataTexture` avoids HTML5 `<canvas>` 2D premultiplied-alpha quantization on `RGB` where `A` is low!
 */
function createPackedOrmDataTexture(
  aoBufOrVal,
  roughBufOrVal,
  metalBufOrVal,
  heightBufOrVal,
  w,
  h,
  { repeatX = 1, repeatY = 1, anisotropy = 12, clamp = false } = {}
) {
  const total = w * h;
  const rgba = new Uint8Array(total * 4);
  const aoIsArr = aoBufOrVal && typeof aoBufOrVal.length === "number";
  const rIsArr = roughBufOrVal && typeof roughBufOrVal.length === "number";
  const mIsArr = metalBufOrVal && typeof metalBufOrVal.length === "number";
  const hIsArr = heightBufOrVal && typeof heightBufOrVal.length === "number";
  const aoConst = aoIsArr ? 255 : Math.max(0, Math.min(255, Math.round(Number(aoBufOrVal ?? 255))));
  const rConst = rIsArr ? 204 : Math.max(0, Math.min(255, Math.round(Number(roughBufOrVal ?? 204))));
  const mConst = mIsArr ? 0 : Math.max(0, Math.min(255, Math.round(Number(metalBufOrVal ?? 0))));
  const hConst = hIsArr ? 128 : Math.max(0, Math.min(255, Math.round(Number(heightBufOrVal ?? 128))));

  for (let i = 0; i < total; i++) {
    const p = i * 4;
    rgba[p] = aoIsArr ? aoBufOrVal[i] : aoConst;
    rgba[p + 1] = rIsArr ? roughBufOrVal[i] : rConst;
    rgba[p + 2] = mIsArr ? metalBufOrVal[i] : mConst;
    rgba[p + 3] = hIsArr ? heightBufOrVal[i] : hConst;
  }

  const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (!clamp) {
    tex.repeat.set(repeatX, repeatY);
  }
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 1. V6 Sun-Aged California Roadway Asphalt Suite (`1024x1024` albedo/normal/roughness):
 *    - Sun-oxidized California aggregate grey-charcoal (`#525458` = `sRGB(82, 84, 88)` — zero jet-black CG tar!),
 *    - Exposed crushed Sierra granite/quartz aggregate speckle + dark basalt chips + dual tire-lane wear,
 *    - High-contrast `roughnessMap` spanning `[0.76..0.95]` (`0.76–0.81` polished tire lanes & quartz facets,
 *      `0.88–0.95` oxidized shoulder aggregate) + crisp `1024x1024` `normalMap` + hairline crack veins (`metalness: 0.0`).
 */
function buildAsphaltPbrSuite() {
  const rng = createSeededRNG(0xa5f41733);
  const macroGrid = buildTileableNoiseTable(64, 0x19a4c101);
  const mesoGrid = buildTileableNoiseTable(256, 0x19a4c102);
  const gritGrid = buildTileableNoiseTable(512, 0x19a4c103);

  const wPbr = 1024;
  const hPbr = 1024;
  const heightBuf = new Uint8Array(wPbr * hPbr);
  const roughBuf = new Uint8Array(wPbr * hPbr);

  const albBase = makeCanvas(wPbr, hPbr);
  const albBaseCtx = albBase.getContext("2d");
  const albImg = albBaseCtx.createImageData(wPbr, hPbr);
  const albData = albImg.data;

  // Precompute lateral dual-lane tire-track wear profile across u in [0..1] (seamless at u=0 and u=1)
  const tireWearU = new Float32Array(wPbr);
  const trackCenters = [0.205, 0.345, 0.655, 0.795];
  for (let x = 0; x < wPbr; x++) {
    const u = x / wPbr;
    let wSum = 0.0;
    for (let k = 0; k < trackCenters.length; k++) {
      const du = (u - trackCenters[k]) / 0.055;
      wSum += Math.exp(-du * du);
    }
    tireWearU[x] = Math.min(1.0, wSum);
  }

  for (let y = 0; y < hPbr; y++) {
    const vNorm = y / hPbr;
    const rowOff = y * wPbr;
    for (let x = 0; x < wPbr; x++) {
      const uNorm = x / wPbr;
      const macro = sampleBilinearTile(macroGrid, 64, uNorm * 8.0, vNorm * 8.0);
      const meso = sampleBilinearTile(mesoGrid, 256, uNorm * 48.0, vNorm * 48.0);
      const gritA = gritGrid[((y & 511) << 9) + (x & 511)];
      const gritB = gritGrid[(((y * 3 + 17) & 511) << 9) + ((x * 3 + 43) & 511)];

      const wear = tireWearU[x] * (0.74 + 0.26 * macro);
      // Exposed crushed quartz/feldspar aggregate flecks & dark basalt chips in sun-oxidized binder
      const fleck =
        gritA > 0.895
          ? (gritA - 0.895) * 320.0
          : gritA < 0.145
            ? -14.0 * ((0.145 - gritA) / 0.145)
            : 0.0;
      const fineSpeck = (gritB - 0.5) * 16.0 + (meso - 0.5) * 11.0 + (macro - 0.5) * 8.5;

      // Sun-aged California aggregate grey-charcoal (#525458 -> 82, 84, 88), slightly darker in tire lanes
      const polishDarken = wear * 7.5;
      const baseR = 82.0 - polishDarken + fineSpeck * 0.97 + fleck * 0.98;
      const baseG = 84.0 - polishDarken + fineSpeck * 1.00 + fleck * 1.00;
      const baseB = 88.0 - polishDarken * 0.90 + fineSpeck * 1.04 + fleck * 1.05;

      const idx = rowOff + x;
      const p = idx * 4;
      albData[p] = Math.max(46, Math.min(144, Math.round(baseR)));
      albData[p + 1] = Math.max(48, Math.min(146, Math.round(baseG)));
      albData[p + 2] = Math.max(52, Math.min(152, Math.round(baseB)));
      albData[p + 3] = 255;

      // High-contrast aggregate relief height (worn slightly flatter in tire lanes)
      const hVal =
        130.0 +
        ((gritB - 0.5) * 88.0 + (gritA - 0.5) * 62.0 + (meso - 0.5) * 30.0) *
          (1.0 - wear * 0.34);
      heightBuf[idx] = Math.max(10, Math.min(248, Math.round(hVal)));

      // High-contrast micro-surface roughness spanning [0.76 .. 0.95]
      const rFloat =
        0.935 -
        wear * 0.135 +
        (macro - 0.5) * 0.045 +
        (meso - 0.5) * 0.040 +
        (gritB - 0.5) * 0.045 -
        (gritA > 0.91 ? 0.055 : 0.0);
      roughBuf[idx] = Math.round(THREE.MathUtils.clamp(rFloat, 0.76, 0.95) * 255.0);
    }
  }
  albBaseCtx.putImageData(albImg, 0, 0);

  // Carve subtle weathered hairline crack & aged matte crack-seal veins seamlessly across tile boundaries
  const roughCanvas = putGrayBufferToCanvas(roughBuf, wPbr, hPbr);
  const rCtx = roughCanvas.getContext("2d");

  const drawWrappedTarCrack = (uStart, vStart, segs, lenScale) => {
    const pts = [{ x: uStart * wPbr, y: vStart * hPbr }];
    let cx = pts[0].x;
    let cy = pts[0].y;
    let ang = Math.PI * 0.5 + (rng() - 0.5) * 0.62;
    for (let s = 0; s < segs; s++) {
      ang += (rng() - 0.5) * 0.68;
      const step = (14.0 + rng() * 22.0) * lenScale;
      cx += Math.cos(ang) * step;
      cy += Math.sin(ang) * step;
      pts.push({ x: cx, y: cy });
    }
    for (const ox of [-wPbr, 0, wPbr]) {
      for (const oy of [-hPbr, 0, hPbr]) {
        albBaseCtx.save();
        albBaseCtx.strokeStyle = "rgba(48, 50, 54, 0.68)";
        albBaseCtx.lineWidth = 2.4;
        albBaseCtx.lineJoin = "round";
        albBaseCtx.lineCap = "round";
        albBaseCtx.beginPath();
        albBaseCtx.moveTo(pts[0].x + ox, pts[0].y + oy);
        for (let k = 1; k < pts.length; k++) albBaseCtx.lineTo(pts[k].x + ox, pts[k].y + oy);
        albBaseCtx.stroke();

        albBaseCtx.strokeStyle = "rgba(32, 34, 38, 0.82)";
        albBaseCtx.lineWidth = 0.95;
        albBaseCtx.stroke();
        albBaseCtx.restore();

        // Aged matte bitumen crack sealant (~0.765 = rgb 195, within [0.76..0.95]!)
        rCtx.save();
        rCtx.strokeStyle = "rgb(195, 195, 195)";
        rCtx.lineWidth = 2.8;
        rCtx.lineJoin = "round";
        rCtx.lineCap = "round";
        rCtx.beginPath();
        rCtx.moveTo(pts[0].x + ox, pts[0].y + oy);
        for (let k = 1; k < pts.length; k++) rCtx.lineTo(pts[k].x + ox, pts[k].y + oy);
        rCtx.stroke();
        rCtx.restore();
      }
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const steps = 16;
      for (let t = 0; t <= steps; t++) {
        const px = Math.floor(pts[k].x + (pts[k + 1].x - pts[k].x) * (t / steps)) & (wPbr - 1);
        const py = Math.floor(pts[k].y + (pts[k + 1].y - pts[k].y) * (t / steps)) & (hPbr - 1);
        const idx = py * wPbr + px;
        heightBuf[idx] = Math.max(8, heightBuf[idx] - 64);
        roughBuf[idx] = 195;
      }
    }
  };

  for (let c = 0; c < 13; c++) {
    drawWrappedTarCrack(0.06 + rng() * 0.88, rng(), 7 + Math.floor(rng() * 7), 1.0);
  }

  const aoBuf = new Uint8Array(wPbr * hPbr);
  for (let i = 0; i < aoBuf.length; i++) {
    aoBuf[i] = Math.max(156, Math.min(255, Math.round(182 + heightBuf[i] * 0.34)));
  }

  const normalCanvas = buildNormalCanvasFromHeightBuffer(heightBuf, wPbr, hPbr, 2.85);
  const ormMap = createPackedOrmDataTexture(aoBuf, roughBuf, 0, heightBuf, wPbr, hPbr, {
    repeatX: 1,
    repeatY: 1,
    anisotropy: 12,
  });

  return {
    map: finalizeTexture(albBase, { repeatX: 1, repeatY: 1, srgb: true, anisotropy: 16 }),
    normalMap: finalizeTexture(normalCanvas, { repeatX: 1, repeatY: 1, srgb: false, anisotropy: 12 }),
    ormMap,
    aoMap: ormMap,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
  };
}

/**
 * 1B. V6 Natural Architectural Sandstone & Sierra Granite Running-Bond Plaza Pavers (`1024x1024`):
 *     - Eliminates the orange-tan cartoon brick grid!
 *     - Warm grey-buff limestone & Sierra granite slabs (`#8F8578`..`#A39889` per-stone value jitter),
 *       recessed weathered mortar joints in AO + `normalMap`, and travertine/granite pitting `roughnessMap` `[0.78..0.93]`.
 */
function buildArchitecturalLimestonePaversSuite() {
  const macroGrid = buildTileableNoiseTable(64, 0x8f857801);
  const mesoGrid = buildTileableNoiseTable(256, 0x8f857802);
  const pitGrid = buildTileableNoiseTable(512, 0x8f857803);
  const crystalGrid = buildTileableNoiseTable(512, 0x8f857804);

  const w = 1024;
  const h = 1024;
  const courses = 8; // 8 architectural stone courses per tile
  const cols = 4; // 4 wide cut-stone ashlar pavers per course (2:1 proportion)
  const courseH = h / courses; // 128px
  const stoneW = w / cols; // 256px

  const albC = makeCanvas(w, h);
  const aCtx = albC.getContext("2d");
  const albImg = aCtx.createImageData(w, h);
  const albData = albImg.data;
  const heightBuf = new Uint8Array(w * h);
  const roughBuf = new Uint8Array(w * h);
  const aoBuf = new Uint8Array(w * h);

  // Deterministic per-stone tone & mineral warmth table across [#8F8578 (143,133,120) .. #A39889 (163,152,137)]
  const stoneRng = createSeededRNG(0xa3988977);
  const stoneJitter = new Float32Array(courses * cols * 2);
  for (let i = 0; i < courses * cols; i++) {
    stoneJitter[i * 2] = stoneRng(); // value mix [0..1] between #8F8578 and #A39889
    stoneJitter[i * 2 + 1] = (stoneRng() - 0.5) * 4.5; // subtle cool granite vs warm buff limestone shift
  }

  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / courseH) % courses;
    const ly = y - row * courseH;
    const dyJoint = Math.min(ly, courseH - ly);
    // Running-bond stagger (50% on odd rows, 25% subtle ashlar shift every 4th row)
    const xShift = row % 2 === 1 ? stoneW * 0.5 : row % 4 === 2 ? stoneW * 0.25 : 0;

    for (let x = 0; x < w; x++) {
      const sx = (x + xShift) % w;
      const col = Math.floor(sx / stoneW) % cols;
      const lx = sx - col * stoneW;
      const dxJoint = Math.min(lx, stoneW - lx);
      const dJoint = Math.min(dxJoint, dyJoint);

      const stIdx = row * cols + col;
      const tStone = stoneJitter[stIdx * 2];
      const warmTilt = stoneJitter[stIdx * 2 + 1];

      const uNorm = x / w;
      const vNorm = y / h;
      const macro = sampleBilinearTile(macroGrid, 64, uNorm * 6.0, vNorm * 6.0);
      const meso = sampleBilinearTile(mesoGrid, 256, uNorm * 32.0, vNorm * 32.0);
      const pit = pitGrid[((y & 511) << 9) + (x & 511)];
      const crys = crystalGrid[(((y * 3 + 11) & 511) << 9) + ((x * 3 + 29) & 511)];

      // Base slab color interpolated cleanly across [#8F8578 .. #A39889]
      let baseR = 143.0 + tStone * 20.0 + warmTilt * 0.55;
      let baseG = 133.0 + tStone * 19.0 + warmTilt * 0.20;
      let baseB = 120.0 + tStone * 17.0 - warmTilt * 0.55;

      // Subtle Sierra granite salt-and-pepper mineral crystals + travertine micropits
      const travertinePit = pit < 0.055 ? -16.0 * ((0.055 - pit) / 0.055) : 0.0;
      const mineralSpeck =
        crys > 0.90 ? 10.5 : crys < 0.10 ? -11.5 : (crys - 0.5) * 9.0;
      const cloudDelta = (macro - 0.5) * 7.5 + (meso - 0.5) * 7.0 + mineralSpeck + travertinePit;

      let r = baseR + cloudDelta;
      let g = baseG + cloudDelta * 0.97;
      let b = baseB + cloudDelta * 0.93;

      let hVal =
        172.0 +
        (meso - 0.5) * 24.0 +
        (crys - 0.5) * 26.0 +
        (pit < 0.055 ? -46.0 : (pit - 0.5) * 18.0);
      let rFloat =
        0.845 +
        (1.0 - tStone) * 0.025 +
        (meso - 0.5) * 0.065 +
        (crys - 0.5) * 0.055 +
        (pit < 0.055 ? 0.065 : 0.0);
      let aoVal = 246.0 + (meso - 0.5) * 14.0 + (pit < 0.055 ? -28.0 : 0.0);

      // Recessed architectural sand-lime mortar joint (dJoint < 2.6px) + subtle hand-dressed stone chamfer (2.6..7.5px)
      if (dJoint < 2.6) {
        const mFrac = 1.0 - dJoint / 2.6;
        const mortarGrain = (crys - 0.5) * 12.0;
        const mr = 98.0 + mortarGrain;
        const mg = 93.0 + mortarGrain;
        const mb = 85.0 + mortarGrain;
        const blend = Math.min(1.0, 0.65 + mFrac * 0.35);
        r = r * (1.0 - blend) + mr * blend;
        g = g * (1.0 - blend) + mg * blend;
        b = b * (1.0 - blend) + mb * blend;
        hVal = 52.0 + (1.0 - mFrac) * 42.0 + (crys - 0.5) * 14.0;
        rFloat = 0.92;
        aoVal = 132.0 + (1.0 - mFrac) * 58.0;
      } else if (dJoint < 7.5) {
        const cFrac = 1.0 - (dJoint - 2.6) / 4.9;
        r -= cFrac * 6.5;
        g -= cFrac * 6.2;
        b -= cFrac * 5.8;
        hVal -= cFrac * 34.0;
        rFloat += cFrac * 0.03;
        aoVal -= cFrac * 26.0;
      }

      const idx = y * w + x;
      const p = idx * 4;
      albData[p] = Math.max(76, Math.min(192, Math.round(r)));
      albData[p + 1] = Math.max(72, Math.min(182, Math.round(g)));
      albData[p + 2] = Math.max(64, Math.min(168, Math.round(b)));
      albData[p + 3] = 255;

      heightBuf[idx] = Math.max(12, Math.min(248, Math.round(hVal)));
      roughBuf[idx] = Math.round(THREE.MathUtils.clamp(rFloat, 0.78, 0.93) * 255.0);
      aoBuf[idx] = Math.max(96, Math.min(255, Math.round(aoVal)));
    }
  }
  aCtx.putImageData(albImg, 0, 0);

  const normC = buildNormalCanvasFromHeightBuffer(heightBuf, w, h, 2.55);
  const ormMap = createPackedOrmDataTexture(aoBuf, roughBuf, 255, heightBuf, w, h, {
    repeatX: 2.2,
    repeatY: 2.2,
    anisotropy: 12,
  });

  return {
    map: finalizeTexture(albC, { repeatX: 2.2, repeatY: 2.2, srgb: true, anisotropy: 16 }),
    normalMap: finalizeTexture(normC, { repeatX: 2.2, repeatY: 2.2, srgb: false, anisotropy: 12 }),
    bumpMap: null,
    ormMap,
    roughnessMap: ormMap,
    aoMap: ormMap,
    metalnessMap: ormMap,
  };
}

/**
 * 1C. Google Visitor Experience / Gradient Canopy Interlocking Hexagonal Granite Pavers (`1024x1024`):
 *     - Matches `jay_google_visitor_experience_front.png`, `02_gradient_canopy_exterior_04.jpg` & `15_hex_pavers_macro_texture.jpg`:
 *       shot-blasted light silver-grey granite hexagons (`#B7B5AE`..`#C7C4BC`) with recessed dark sand-swept joints (`#4A4945`),
 *       salt-and-pepper mineral speckle, crisp beveled hex normal relief, and `[0.80..0.93]` `roughnessMap`.
 */
function buildVisitorHexPaversPbrSuite() {
  const mesoGrid = buildTileableNoiseTable(256, 0x6e789901);
  const gritGrid = buildTileableNoiseTable(512, 0x6e789902);
  const w = 1024;
  const h = 1024;

  // Periodic hex lattice: 8 horizontal hex widths x 14 staggered row pairs (14 / (8 * sqrt(3)) = 1.0104 -> near-exact regular hexagons!)
  const NX = 8;
  const NY = 7; // each period in Y contains 2 staggered hex rows -> 14 rows total

  const albC = makeCanvas(w, h);
  const aCtx = albC.getContext("2d");
  const albImg = aCtx.createImageData(w, h);
  const albData = albImg.data;
  const heightBuf = new Uint8Array(w * h);
  const roughBuf = new Uint8Array(w * h);
  const aoBuf = new Uint8Array(w * h);

  const SQRT3 = 1.7320508;
  const hexToneHash = (ix, iy) => {
    let n = (Math.imul(ix & 255, 0x9e3779b1) ^ Math.imul(iy & 255, 0x85ebca77)) >>> 0;
    n = Math.imul(n ^ (n >>> 15), 0xc2b2ae3d) >>> 0;
    return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
  };

  for (let y = 0; y < h; y++) {
    const v = (y / h) * NY * SQRT3;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * NX;

      // Nearest periodic hexagon center among the two staggered rectangular sub-lattices
      const iA = Math.round(u);
      const jA = Math.round(v / SQRT3);
      const dxA = u - iA;
      const dyA = v - jA * SQRT3;
      const d2A = dxA * dxA + dyA * dyA;

      const iB = Math.round(u - 0.5);
      const jB = Math.round((v - 0.5 * SQRT3) / SQRT3);
      const dxB = u - (iB + 0.5);
      const dyB = v - (jB + 0.5) * SQRT3;
      const d2B = dxB * dxB + dyB * dyB;

      let lx;
      let ly;
      let cellIdX;
      let cellIdY;
      if (d2A <= d2B) {
        lx = Math.abs(dxA);
        ly = Math.abs(dyA);
        cellIdX = ((iA % NX) + NX) % NX;
        cellIdY = (((jA * 2) % (NY * 2)) + NY * 2) % (NY * 2);
      } else {
        lx = Math.abs(dxB);
        ly = Math.abs(dyB);
        cellIdX = ((iB % NX) + NX) % NX;
        cellIdY = (((jB * 2 + 1) % (NY * 2)) + NY * 2) % (NY * 2);
      }

      // Exact distance to hexagon boundary (inradius = 0.5 -> hexDist = 0.5 on edge, 0 at center)
      const hexMetric = Math.max(lx, 0.5 * lx + 0.8660254 * ly);
      const edgeDist = Math.max(0.0, 0.5 - hexMetric); // 0 at joint center, ~0.5 at hex center

      const hTone = hexToneHash(cellIdX, cellIdY);
      const meso = sampleBilinearTile(mesoGrid, 256, (x / w) * 32.0, (y / h) * 32.0);
      const grit = gritGrid[((y & 511) << 9) + (x & 511)];

      // Shot-blasted pale silver-grey granite (#B8B6AF .. #C8C5BD) with fine black biotite & white quartz specks
      const speck = grit > 0.90 ? 14.0 : grit < 0.11 ? -18.0 : (grit - 0.5) * 12.0;
      const baseV = 184.0 + hTone * 15.0 + (meso - 0.5) * 7.0 + speck;
      let r = baseV + 1.0;
      let g = baseV - 0.5;
      let b = baseV - 5.5;

      let hVal = 176.0 + (grit - 0.5) * 34.0 + (meso - 0.5) * 16.0;
      let rFloat = 0.84 + (1.0 - hTone) * 0.03 + (grit - 0.5) * 0.06;
      let aoVal = 248.0 + (meso - 0.5) * 12.0;

      if (edgeDist < 0.022) {
        // Recessed sand-swept joint groove (#484743)
        const jFrac = 1.0 - edgeDist / 0.022;
        const jr = 72.0 + (grit - 0.5) * 14.0;
        const jg = 71.0 + (grit - 0.5) * 14.0;
        const jb = 67.0 + (grit - 0.5) * 14.0;
        const blend = Math.min(1.0, 0.72 + jFrac * 0.28);
        r = r * (1.0 - blend) + jr * blend;
        g = g * (1.0 - blend) + jg * blend;
        b = b * (1.0 - blend) + jb * blend;
        hVal = 44.0 + (1.0 - jFrac) * 38.0;
        rFloat = 0.93;
        aoVal = 118.0 + (1.0 - jFrac) * 62.0;
      } else if (edgeDist < 0.052) {
        // Precision 2mm beveled paver edge
        const bFrac = 1.0 - (edgeDist - 0.022) / 0.030;
        r -= bFrac * 8.0;
        g -= bFrac * 8.0;
        b -= bFrac * 7.5;
        hVal -= bFrac * 36.0;
        rFloat += bFrac * 0.03;
        aoVal -= bFrac * 28.0;
      }

      const idx = y * w + x;
      const p = idx * 4;
      albData[p] = Math.max(52, Math.min(226, Math.round(r)));
      albData[p + 1] = Math.max(50, Math.min(224, Math.round(g)));
      albData[p + 2] = Math.max(46, Math.min(218, Math.round(b)));
      albData[p + 3] = 255;

      heightBuf[idx] = Math.max(12, Math.min(248, Math.round(hVal)));
      roughBuf[idx] = Math.round(THREE.MathUtils.clamp(rFloat, 0.80, 0.93) * 255.0);
      aoBuf[idx] = Math.max(96, Math.min(255, Math.round(aoVal)));
    }
  }
  aCtx.putImageData(albImg, 0, 0);

  const ormMap = createPackedOrmDataTexture(aoBuf, roughBuf, 0, heightBuf, w, h, {
    repeatX: 4,
    repeatY: 4,
    anisotropy: 12,
  });

  return {
    map: finalizeTexture(albC, { repeatX: 4, repeatY: 4, srgb: true, anisotropy: 16 }),
    normalMap: finalizeTexture(buildNormalCanvasFromHeightBuffer(heightBuf, w, h, 2.45), {
      repeatX: 4,
      repeatY: 4,
      srgb: false,
      anisotropy: 12,
    }),
    ormMap,
    aoMap: ormMap,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
  };
}

let _cachedPropMicroGrainSuite = null;

/**
 * Shared `512x512` Micro-Grain Packed ORM + Normal PBR Maps for de-plasticizing Android Statues,
 * Patio Umbrellas, Street Furniture, Stainless Bollards & Cedar Acoustic Slats (`roughness >= 0.58`).
 */
function getPropMicroGrainSuite() {
  if (_cachedPropMicroGrainSuite) return _cachedPropMicroGrainSuite;
  const meso = buildTileableNoiseTable(256, 0x41d90b11);
  const fine = buildTileableNoiseTable(512, 0x41d90b12);
  const w = 512;
  const h = 512;

  const fgHeight = new Uint8Array(w * h);
  const fgRough = new Uint8Array(w * h);
  const fgNormRough = new Uint8Array(w * h); // normalized [0.88..1.00] multiplier for scalar roughness >= 0.62
  const fgAo = new Uint8Array(w * h);
  const canvasHeight = new Uint8Array(w * h);
  const canvasRough = new Uint8Array(w * h);
  const canvasAo = new Uint8Array(w * h);
  const cedarHeight = new Uint8Array(w * h);
  const cedarRough = new Uint8Array(w * h);
  const cedarAo = new Uint8Array(w * h);
  const steelHeight = new Uint8Array(w * h);
  const steelRough = new Uint8Array(w * h);
  const steelAo = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    const weaveY = Math.sin(y * 1.570796) * 0.5 + 0.5;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const m = sampleBilinearTile(meso, 256, u * 24.0, v * 24.0);
      const f = fine[((y & 511) << 9) + (x & 511)];
      const idx = y * w + x;

      // 1. Satin architectural fiberglass / matte powder-coat micro-stipple
      fgHeight[idx] = Math.max(20, Math.min(236, Math.round(128.0 + (f - 0.5) * 52.0 + (m - 0.5) * 28.0)));
      fgRough[idx] = Math.round(THREE.MathUtils.clamp(0.68 + (m - 0.5) * 0.12 + (f - 0.5) * 0.10, 0.58, 0.80) * 255.0);
      fgNormRough[idx] = Math.round(THREE.MathUtils.clamp(0.94 + (m - 0.5) * 0.08 + (f - 0.5) * 0.08, 0.88, 1.0) * 255.0);
      fgAo[idx] = Math.max(216, Math.min(255, Math.round(244.0 + (m - 0.5) * 18.0)));

      // 2. Woven Sunbrella architectural canvas (patio umbrellas & tents)
      const weaveX = Math.sin(x * 1.570796) * 0.5 + 0.5;
      const basketWeave = ((x + y) & 2) === 0 ? weaveX : weaveY;
      canvasHeight[idx] = Math.max(16, Math.min(240, Math.round(112.0 + basketWeave * 56.0 + (f - 0.5) * 24.0)));
      canvasRough[idx] = Math.round(THREE.MathUtils.clamp(0.84 + (basketWeave - 0.5) * 0.08 + (m - 0.5) * 0.06, 0.74, 0.92) * 255.0);
      canvasAo[idx] = Math.max(204, Math.min(255, Math.round(226.0 + basketWeave * 28.0)));

      // 3. Western Red Cedar acoustic louvers (fine longitudinal wood grain)
      const grain = sampleBilinearTile(meso, 256, u * 48.0, v * 6.0);
      const fiber = fine[((y & 63) << 9) + (x & 511)];
      cedarHeight[idx] = Math.max(16, Math.min(242, Math.round(128.0 + (grain - 0.5) * 68.0 + (fiber - 0.5) * 34.0)));
      cedarRough[idx] = Math.round(THREE.MathUtils.clamp(0.68 + (grain - 0.5) * 0.14 + (fiber - 0.5) * 0.08, 0.58, 0.82) * 255.0);
      cedarAo[idx] = Math.max(196, Math.min(255, Math.round(224.0 + (grain - 0.5) * 44.0)));

      // 4. Circumferential / radial brushed stainless steel (Visitor Experience bollards)
      const brush = sampleBilinearTile(meso, 256, u * 8.0, v * 96.0);
      steelHeight[idx] = Math.max(32, Math.min(224, Math.round(128.0 + (brush - 0.5) * 44.0)));
      steelRough[idx] = Math.round(THREE.MathUtils.clamp(0.42 + (brush - 0.5) * 0.12, 0.34, 0.52) * 255.0);
      steelAo[idx] = Math.max(222, Math.min(255, Math.round(244.0 + (brush - 0.5) * 18.0)));
    }
  }

  const fiberglassOrm = createPackedOrmDataTexture(fgAo, fgRough, 255, fgHeight, w, h, {
    repeatX: 4,
    repeatY: 4,
    anisotropy: 8,
  });
  const fiberglassUnitOrm = createPackedOrmDataTexture(fgAo, fgNormRough, 255, fgHeight, w, h, {
    repeatX: 4,
    repeatY: 4,
    anisotropy: 8,
  });
  const canvasOrm = createPackedOrmDataTexture(canvasAo, canvasRough, 0, canvasHeight, w, h, {
    repeatX: 8,
    repeatY: 8,
    anisotropy: 8,
  });
  const cedarOrm = createPackedOrmDataTexture(cedarAo, cedarRough, 0, cedarHeight, w, h, {
    repeatX: 3,
    repeatY: 2,
    anisotropy: 8,
  });
  const steelOrm = createPackedOrmDataTexture(steelAo, steelRough, 255, steelHeight, w, h, {
    repeatX: 2,
    repeatY: 4,
    anisotropy: 8,
  });

  _cachedPropMicroGrainSuite = {
    fiberglassNormal: finalizeTexture(buildNormalCanvasFromHeightBuffer(fgHeight, w, h, 1.35), {
      repeatX: 4,
      repeatY: 4,
      srgb: false,
      anisotropy: 8,
    }),
    fiberglassOrm,
    fiberglassRoughness: fiberglassOrm,
    fiberglassUnitOrm,
    fiberglassUnitRoughness: fiberglassUnitOrm,
    canvasNormal: finalizeTexture(buildNormalCanvasFromHeightBuffer(canvasHeight, w, h, 1.65), {
      repeatX: 8,
      repeatY: 8,
      srgb: false,
      anisotropy: 8,
    }),
    canvasOrm,
    canvasRoughness: canvasOrm,
    cedarNormal: finalizeTexture(buildNormalCanvasFromHeightBuffer(cedarHeight, w, h, 1.75), {
      repeatX: 3,
      repeatY: 2,
      srgb: false,
      anisotropy: 8,
    }),
    cedarOrm,
    cedarRoughness: cedarOrm,
    steelNormal: finalizeTexture(buildNormalCanvasFromHeightBuffer(steelHeight, w, h, 1.15), {
      repeatX: 2,
      repeatY: 4,
      srgb: false,
      anisotropy: 8,
    }),
    steelOrm,
    steelRoughness: steelOrm,
  };
  return _cachedPropMicroGrainSuite;
}

/**
 * 2. AAA PBR Architectural Concrete Sidewalk Suite (`1024x1024`, `379 px/m` texel density):
 *    - Cool-warm broom-finished gray concrete (`#b9b4aa` = `rgb(185, 180, 170)`, ZERO orange-tan!),
 *    - Exact `2 x 2` slab layout per UV tile -> `1.35m x 1.35m` control/expansion joint grooves on `2.70m` walks,
 *    - Picture-frame troweled borders (`roughness ~0.68`) + broomed center panel (`0.82–0.88`),
 *    - Packed `ormMap` (`R=AO` joint crevices, `G=Roughness`, `B=0`, `A=Height` for POM) & zero redundant `bumpMap`.
 */
function buildConcreteSidewalkPbrSuite() {
  const macroGrid = buildTileableNoiseTable(64, 0x51de2201);
  const mesoGrid = buildTileableNoiseTable(256, 0x51de2202);
  const gritGrid = buildTileableNoiseTable(512, 0x51de2203);

  const w = 1024;
  const h = 1024;
  const half = 512;
  const heightBuf = new Uint8Array(w * h);
  const roughBuf = new Uint8Array(w * h);
  const aoBuf = new Uint8Array(w * h);

  const albCanvas = makeCanvas(w, h);
  const aCtx = albCanvas.getContext("2d");
  const albImg = aCtx.createImageData(w, h);
  const albData = albImg.data;

  // Deterministic subtle per-slab tone offsets for the 2x2 slabs (`1.35m x 1.35m` each)
  const slabTone = [2.5, -2.0, -1.5, 2.0];

  for (let y = 0; y < h; y++) {
    const vNorm = y / h;
    const dyJoint = Math.min(y % half, half - (y % half)); // pixels to nearest horizontal 1.35m joint
    const slabRow = y >= half ? 2 : 0;
    // Fine horizontal broom-finish bristle striations
    const broom =
      Math.sin(y * 1.45) * 2.2 +
      Math.sin(y * 0.62 + 1.1) * 1.6;

    for (let x = 0; x < w; x++) {
      const uNorm = x / w;
      const dxJoint = Math.min(x % half, half - (x % half)); // pixels to nearest vertical 1.35m joint
      const dJoint = Math.min(dxJoint, dyJoint);
      const slabIdx = slabRow + (x >= half ? 1 : 0);

      const macro = sampleBilinearTile(macroGrid, 64, uNorm * 6.0, vNorm * 6.0);
      const meso = sampleBilinearTile(mesoGrid, 256, uNorm * 36.0, vNorm * 36.0);
      const grit = gritGrid[((y & 511) << 9) + (x & 511)];

      // Troweled picture-frame margin (`18px` ~ `4.7cm`) around each 1.35m slab, broomed inside!
      const inBroomField = dxJoint > 20 && dyJoint > 20 ? 1.0 : 0.0;
      const broomDelta = broom * inBroomField;

      // V-tooled control joint groove (`0..4px`) + subtle weathered chamfer (`4..13px`)
      let jointShade = 0.0;
      let jointDepth = 0.0;
      let aoVal = 248.0 + (meso - 0.5) * 10.0;
      if (dJoint < 3.5) {
        const t = 1.0 - dJoint / 3.5;
        jointShade = -66.0 * t;
        jointDepth = -112.0 * t;
        aoVal = 128.0 + (1.0 - t) * 68.0;
      } else if (dJoint < 12.0) {
        const t = 1.0 - (dJoint - 3.5) / 8.5;
        jointShade = -11.0 * t;
        jointDepth = -18.0 * t;
        aoVal -= t * 24.0;
      }

      const agg =
        grit > 0.92 ? 9.0 : grit < 0.08 ? -10.0 : (grit - 0.5) * 9.0;
      const delta =
        slabTone[slabIdx] +
        (macro - 0.5) * 10.0 +
        (meso - 0.5) * 8.0 +
        agg +
        broomDelta * 0.85 +
        jointShade;

      // Cool-warm architectural gray concrete #b9b4aa = (185, 180, 170) — NEVER orange-tan!
      const r = 185.0 + delta;
      const g = 180.0 + delta * 0.99;
      const b = 170.0 + delta * 0.96;

      const idx = y * w + x;
      const p = idx * 4;
      albData[p] = Math.max(68, Math.min(226, Math.round(r)));
      albData[p + 1] = Math.max(66, Math.min(222, Math.round(g)));
      albData[p + 2] = Math.max(62, Math.min(214, Math.round(b)));
      albData[p + 3] = 255;

      const hVal =
        164.0 +
        jointDepth +
        broomDelta * 6.5 +
        (grit - 0.5) * 28.0 +
        (meso - 0.5) * 14.0;
      heightBuf[idx] = Math.max(8, Math.min(250, Math.round(hVal)));

      const rFloat =
        (inBroomField > 0.5 ? 0.83 : 0.69) +
        (macro - 0.5) * 0.05 +
        (grit - 0.5) * 0.05 +
        (dJoint < 4.0 ? 0.08 : 0.0);
      roughBuf[idx] = Math.round(THREE.MathUtils.clamp(rFloat, 0.66, 0.90) * 255.0);
      aoBuf[idx] = Math.max(96, Math.min(255, Math.round(aoVal)));
    }
  }
  aCtx.putImageData(albImg, 0, 0);

  const normalCanvas = buildNormalCanvasFromHeightBuffer(heightBuf, w, h, 2.2);
  const ormMap = createPackedOrmDataTexture(aoBuf, roughBuf, 0, heightBuf, w, h, {
    repeatX: 1,
    repeatY: 1,
    anisotropy: 12,
  });

  return {
    map: finalizeTexture(albCanvas, { repeatX: 1, repeatY: 1, srgb: true, anisotropy: 12 }),
    normalMap: finalizeTexture(normalCanvas, { repeatX: 1, repeatY: 1, srgb: false, anisotropy: 8 }),
    bumpMap: null,
    ormMap,
    aoMap: ormMap,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
  };
}

/**
 * 2B. V7 Architectural Board-Formed Concrete Suite (`1024x1024`, `320–512 px/m` texel density):
 *     - Calibrated for Gradient Canopy planter walls (`#ABA9A2`), pavilion piers, and architectural concrete walls:
 *       8 horizontal Douglas-fir formwork plank courses per tile, subtle wood-grain imprint in cured concrete,
 *       recessed plank-seam fins/grooves, snap-tie cone dimples, tangent-space `normalMap`, and Packed `ormMap` (`A=Height` POM).
 */
function buildBoardFormedConcretePbrSuite() {
  const macroGrid = buildTileableNoiseTable(64, 0xaba9a201);
  const grainGrid = buildTileableNoiseTable(256, 0xaba9a202);
  const gritGrid = buildTileableNoiseTable(512, 0xaba9a203);

  const w = 1024;
  const h = 1024;
  const planks = 8;
  const plankH = h / planks; // 128px per formwork plank
  const heightBuf = new Uint8Array(w * h);
  const roughBuf = new Uint8Array(w * h);
  const aoBuf = new Uint8Array(w * h);

  const albCanvas = makeCanvas(w, h);
  const aCtx = albCanvas.getContext("2d");
  const albImg = aCtx.createImageData(w, h);
  const albData = albImg.data;

  const plankRng = createSeededRNG(0xbf0c2027);
  const plankOffsets = new Float32Array(planks * 2);
  for (let p = 0; p < planks; p++) {
    plankOffsets[p * 2] = (plankRng() - 0.5) * 7.5; // subtle plank-to-plank concrete hydration value shift
    plankOffsets[p * 2 + 1] = plankRng() * 10.0; // grain phase offset
  }

  for (let y = 0; y < h; y++) {
    const pRow = Math.floor(y / plankH) % planks;
    const ly = y - pRow * plankH;
    const dySeam = Math.min(ly, plankH - ly);
    const pTone = plankOffsets[pRow * 2];
    const pPhase = plankOffsets[pRow * 2 + 1];
    const vNorm = y / h;

    for (let x = 0; x < w; x++) {
      const uNorm = x / w;
      const macro = sampleBilinearTile(macroGrid, 64, uNorm * 6.0, vNorm * 6.0);
      // Longitudinal wood-grain imprint transferred from timber formwork planks into architectural concrete
      const woodGrain = sampleBilinearTile(grainGrid, 256, uNorm * 12.0 + pPhase, (ly / plankH) * 28.0 + pPhase);
      const grit = gritGrid[((y & 511) << 9) + (x & 511)];

      // Snap-tie cone recesses at x = 256, 768 on alternating plank pairs
      const tieY = ((pRow >> 1) * 2 + 1) * plankH;
      const dyTie = Math.min(Math.abs(y - tieY), h - Math.abs(y - tieY));
      const dxTie = Math.min(Math.abs(x - 256), Math.abs(x - 768));
      const dTie = Math.hypot(dxTie, dyTie);

      let delta = pTone + (macro - 0.5) * 9.0 + (woodGrain - 0.5) * 8.5 + (grit - 0.5) * 7.0;
      let hVal = 166.0 + pTone * 2.2 + (woodGrain - 0.5) * 34.0 + (grit - 0.5) * 18.0;
      let rFloat = 0.80 + (woodGrain - 0.5) * 0.08 + (grit - 0.5) * 0.05;
      let aoVal = 248.0 + (woodGrain - 0.5) * 12.0;

      // Formwork horizontal plank joint seam
      if (dySeam < 2.8) {
        const sFrac = 1.0 - dySeam / 2.8;
        delta -= sFrac * 36.0;
        hVal -= sFrac * 96.0;
        rFloat = Math.min(0.92, rFloat + sFrac * 0.09);
        aoVal = 128.0 + (1.0 - sFrac) * 72.0;
      } else if (dySeam < 7.0) {
        const cFrac = 1.0 - (dySeam - 2.8) / 4.2;
        hVal += cFrac * 12.0; // tiny concrete grout lip beside plank seam
        aoVal -= cFrac * 16.0;
      }

      // Recessed architectural form-tie cone plug (`r = 9px`)
      if (dTie < 9.5) {
        const tFrac = 1.0 - dTie / 9.5;
        delta -= tFrac * 32.0;
        hVal = 48.0 + (1.0 - tFrac) * 76.0;
        rFloat = 0.89;
        aoVal = Math.min(aoVal, 116.0 + (1.0 - tFrac) * 84.0);
      }

      // Neutral architectural cool-warm grey concrete (#B4B2AA -> 180, 178, 170)
      const idx = y * w + x;
      const p = idx * 4;
      albData[p] = Math.max(76, Math.min(220, Math.round(180.0 + delta)));
      albData[p + 1] = Math.max(75, Math.min(218, Math.round(178.0 + delta * 0.99)));
      albData[p + 2] = Math.max(72, Math.min(212, Math.round(170.0 + delta * 0.96)));
      albData[p + 3] = 255;

      heightBuf[idx] = Math.max(10, Math.min(250, Math.round(hVal)));
      roughBuf[idx] = Math.round(THREE.MathUtils.clamp(rFloat, 0.72, 0.92) * 255.0);
      aoBuf[idx] = Math.max(96, Math.min(255, Math.round(aoVal)));
    }
  }
  aCtx.putImageData(albImg, 0, 0);

  const ormMap = createPackedOrmDataTexture(aoBuf, roughBuf, 0, heightBuf, w, h, {
    repeatX: 2,
    repeatY: 2,
    anisotropy: 12,
  });

  return {
    map: finalizeTexture(albCanvas, { repeatX: 2, repeatY: 2, srgb: true, anisotropy: 12 }),
    normalMap: finalizeTexture(buildNormalCanvasFromHeightBuffer(heightBuf, w, h, 2.35), {
      repeatX: 2,
      repeatY: 2,
      srgb: false,
      anisotropy: 12,
    }),
    ormMap,
    aoMap: ormMap,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
  };
}

/**
 * 2C. V7 Bay View & Gradient Canopy Dragonscale Solar Roof Shingles Suite (`1024x1024`):
 *     - Stepped overlapping diamond/scallop photovoltaic shingles (`repeat 6x3`, `~380 px/m`),
 *       crisp underlap shadow-step relief in `normalMap` + `ormMap.a` (POM), underlap crevice AO in `R`,
 *       ceramic-glazed PV cell (`roughness ~0.28`, `metalness ~0.62`) vs recessed dark seam (`roughness ~0.72`, `metalness ~0.12`).
 */
function buildDragonscaleSolarPbrSuite() {
  const microGrid = buildTileableNoiseTable(256, 0xd4a60501);
  const w = 1024;
  const h = 1024;
  const cols = 8;
  const rows = 8;
  const heightBuf = new Uint8Array(w * h);
  const roughBuf = new Uint8Array(w * h);
  const metalBuf = new Uint8Array(w * h);
  const aoBuf = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const vf = (y / h) * rows;
    for (let x = 0; x < w; x++) {
      const uf = (x / w) * cols;
      // Diamond lattice (`u + v`, `u - v`) for overlapping architectural dragonscale solar shingles
      const dA = uf + vf;
      const dB = uf - vf + rows;
      const fA = dA - Math.floor(dA);
      const fB = dB - Math.floor(dB);
      const cellId = ((Math.floor(dA) * 13 + Math.floor(dB) * 7) & 15) / 15.0;

      const edgeDist = Math.min(Math.min(fA, 1.0 - fA), Math.min(fB, 1.0 - fB));
      const micro = sampleBilinearTile(microGrid, 256, (x / w) * 32.0, (y / h) * 32.0);
      // Subtle PV silicon wafer busbar micro-lines inside each diamond shingle
      const waferLine = Math.min(Math.abs(((fA * 4.0) % 1.0) - 0.5), Math.abs(((fB * 4.0) % 1.0) - 0.5));
      const onBusbar = waferLine < 0.035 && edgeDist > 0.06 ? 1.0 : 0.0;

      // Stepped overlap: shingle tilts from recessed upper tuck (`fA+fB` low) to proud lower lip (`fA` near 1)
      const stepSlope = ((fA - 0.5) * 0.5 + (vf - Math.floor(vf) - 0.5) * 0.5);
      let hVal = 176.0 + stepSlope * 44.0 + cellId * 8.0 + (micro - 0.5) * 6.0 - onBusbar * 6.0;
      let rFloat = 0.30 + (micro - 0.5) * 0.04 + cellId * 0.03 - onBusbar * 0.05;
      let mByte = 250; // scales material.metalness (0.62) -> ~0.61 on PV shingle face
      let aoVal = 248.0 - Math.max(0.0, -stepSlope) * 18.0;

      if (edgeDist < 0.038) {
        const jFrac = 1.0 - edgeDist / 0.038;
        hVal = 42.0 + (1.0 - jFrac) * 58.0;
        rFloat = 0.74;
        mByte = 48; // recessed dark EPDM/ceramic weather-seal seam
        aoVal = 112.0 + (1.0 - jFrac) * 76.0;
      } else if (edgeDist < 0.075) {
        const bFrac = 1.0 - (edgeDist - 0.038) / 0.037;
        hVal += bFrac * 14.0; // crisp raised overlapping shingle lip
        rFloat -= bFrac * 0.03;
      }

      const idx = y * w + x;
      heightBuf[idx] = Math.max(12, Math.min(250, Math.round(hVal)));
      roughBuf[idx] = Math.round(THREE.MathUtils.clamp(rFloat, 0.22, 0.78) * 255.0);
      metalBuf[idx] = mByte;
      aoBuf[idx] = Math.max(96, Math.min(255, Math.round(aoVal)));
    }
  }

  const ormMap = createPackedOrmDataTexture(aoBuf, roughBuf, metalBuf, heightBuf, w, h, {
    repeatX: 6,
    repeatY: 3,
    anisotropy: 12,
  });

  return {
    normalMap: finalizeTexture(buildNormalCanvasFromHeightBuffer(heightBuf, w, h, 2.65), {
      repeatX: 6,
      repeatY: 3,
      srgb: false,
      anisotropy: 12,
    }),
    ormMap,
    aoMap: ormMap,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
  };
}

/**
 * 2D. V7 Coast Redwood (`Sequoia sempervirens`) Deep Fibrous Bark Suite (`512x1024`, `340+ px/m`):
 *     - Interlocking vertical cinnamon-reddish-brown fibrous bark ridges (`#7C4E38`..`#946046`)
 *       with deep shadowed longitudinal char-brown furrows (`#352118`), tangent-space `normalMap`,
 *       and Packed `ormMap` (`R=AO` deep furrow occlusion, `G=Roughness [0.84..0.96]`, `B=0`, `A=Height` POM).
 */
function buildCoastRedwoodBarkPbrSuite() {
  const ridgeGrid = buildTileableNoiseTable(128, 0x784c3701);
  const fiberGrid = buildTileableNoiseTable(256, 0x784c3702);
  const fineGrid = buildTileableNoiseTable(512, 0x784c3703);

  const w = 512;
  const h = 1024;
  const heightBuf = new Uint8Array(w * h);
  const roughBuf = new Uint8Array(w * h);
  const aoBuf = new Uint8Array(w * h);

  const albC = makeCanvas(w, h);
  const aCtx = albC.getContext("2d");
  const albImg = aCtx.createImageData(w, h);
  const albData = albImg.data;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // Braided vertical redwood bark furrow warp
      const warp = (sampleBilinearTile(ridgeGrid, 128, u * 6.0, v * 4.0) - 0.5) * 0.085;
      const ridgeWave = Math.abs(Math.sin(((u + warp) * 14.0) * Math.PI));
      const subRidge = sampleBilinearTile(ridgeGrid, 128, (u + warp * 0.6) * 28.0, v * 7.0);
      const fiber = sampleBilinearTile(fiberGrid, 256, u * 64.0, v * 12.0);
      const fine = fineGrid[((y & 511) << 9) + (x & 511)];

      const barkElev = THREE.MathUtils.clamp(
        Math.pow(ridgeWave, 0.68) * 0.62 + subRidge * 0.24 + fiber * 0.14,
        0.0,
        1.0
      );
      const furrow = 1.0 - smoothstepJs(0.16, 0.56, barkElev);

      // Sun-warmed fibrous cinnamon ridge (#8A573E -> 138, 87, 62) -> deep char-umbrian fissure (#382219 -> 56, 34, 25)
      const r = THREE.MathUtils.lerp(138.0, 54.0, furrow) + (fiber - 0.5) * 16.0 + (fine - 0.5) * 10.0;
      const g = THREE.MathUtils.lerp(87.0, 34.0, furrow) + (fiber - 0.5) * 11.0 + (fine - 0.5) * 7.0;
      const b = THREE.MathUtils.lerp(62.0, 25.0, furrow) + (fiber - 0.5) * 8.0 + (fine - 0.5) * 5.0;

      const idx = y * w + x;
      const p = idx * 4;
      albData[p] = Math.max(32, Math.min(176, Math.round(r)));
      albData[p + 1] = Math.max(20, Math.min(122, Math.round(g)));
      albData[p + 2] = Math.max(15, Math.min(92, Math.round(b)));
      albData[p + 3] = 255;

      heightBuf[idx] = Math.max(10, Math.min(250, Math.round(28.0 + barkElev * 212.0)));
      roughBuf[idx] = Math.round(THREE.MathUtils.clamp(0.85 + furrow * 0.10 + (fine - 0.5) * 0.04, 0.82, 0.96) * 255.0);
      aoBuf[idx] = Math.max(92, Math.min(255, Math.round(248.0 - furrow * 138.0)));
    }
  }
  aCtx.putImageData(albImg, 0, 0);

  const ormMap = createPackedOrmDataTexture(aoBuf, roughBuf, 0, heightBuf, w, h, {
    repeatX: 3,
    repeatY: 4,
    anisotropy: 12,
  });

  return {
    map: finalizeTexture(albC, { repeatX: 3, repeatY: 4, srgb: true, anisotropy: 12 }),
    normalMap: finalizeTexture(buildNormalCanvasFromHeightBuffer(heightBuf, w, h, 3.1), {
      repeatX: 3,
      repeatY: 4,
      srgb: false,
      anisotropy: 12,
    }),
    ormMap,
    aoMap: ormMap,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
  };
}

function smoothstepJs(edge0, edge1, x) {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / Math.max(edge1 - edge0, 1e-6)));
  return t * t * (3.0 - 2.0 * t);
}

/**
 * 3. AAA PBR Chiseled Sierra Granite Curb (`1024x1024`), Concrete Gutter & Cast-Iron Storm Grate:
 *    - Speckled Sierra granite (`#8e8c86` = `rgb(142, 140, 134)`) with biotite/quartz/feldspar mineral crystals,
 *      chiseled bush-hammered relief, and dressed granite block mortar seams.
 */
function buildGraniteCurbAndGutterSuite() {
  const mesoGrid = buildTileableNoiseTable(256, 0x94a11701);
  const crystalGrid = buildTileableNoiseTable(512, 0x94a11702);
  const crystalGrid2 = buildTileableNoiseTable(512, 0x94a11703);

  const w = 1024;
  const h = 1024;
  const heightBuf = new Uint8Array(w * h);
  const roughBuf = new Uint8Array(w * h);
  const aoBuf = new Uint8Array(w * h);

  const albCanvas = makeCanvas(w, h);
  const aCtx = albCanvas.getContext("2d");
  const albImg = aCtx.createImageData(w, h);
  const albData = albImg.data;

  for (let y = 0; y < h; y++) {
    const vNorm = y / h;
    // Dressed granite curb block mortar seam at y = 0 / 512 (`~1.8m` curb block length)
    const dySeam = Math.min(y % 512, 512 - (y % 512));
    const seamDark = dySeam < 4 ? -44.0 * (1.0 - dySeam / 4.0) : 0.0;
    const seamDip = dySeam < 5 ? -85.0 * (1.0 - dySeam / 5.0) : 0.0;
    const seamAo = dySeam < 5 ? -92.0 * (1.0 - dySeam / 5.0) : 0.0;

    for (let x = 0; x < w; x++) {
      const uNorm = x / w;
      const meso = sampleBilinearTile(mesoGrid, 256, uNorm * 32.0, vNorm * 32.0);
      const c1 = crystalGrid[((y & 511) << 9) + (x & 511)];
      const c2 = crystalGrid2[(((y * 2 + 19) & 511) << 9) + ((x * 2 + 37) & 511)];

      // Salt-and-pepper Sierra granite mineral crystals (dark biotite + pale quartz/feldspar)
      let mineral = (c2 - 0.5) * 22.0 + (meso - 0.5) * 14.0;
      let micaGlint = 0.0;
      if (c1 > 0.84) {
        mineral += 26.0;
        micaGlint = -0.14;
      } else if (c1 < 0.17) {
        mineral -= 34.0;
        micaGlint = -0.06;
      }

      const d = mineral + seamDark;
      const idx = y * w + x;
      const p = idx * 4;
      albData[p] = Math.max(46, Math.min(206, Math.round(142.0 + d)));
      albData[p + 1] = Math.max(45, Math.min(204, Math.round(140.0 + d * 0.99)));
      albData[p + 2] = Math.max(42, Math.min(198, Math.round(134.0 + d * 0.96)));
      albData[p + 3] = 255;

      heightBuf[idx] = Math.max(
        10,
        Math.min(248, Math.round(150.0 + seamDip + (c1 - 0.5) * 58.0 + (meso - 0.5) * 34.0))
      );
      roughBuf[idx] = Math.round(
        THREE.MathUtils.clamp(0.72 + micaGlint + (meso - 0.5) * 0.10, 0.54, 0.84) * 255.0
      );
      aoBuf[idx] = Math.max(112, Math.min(255, Math.round(246.0 + seamAo + (meso - 0.5) * 14.0)));
    }
  }
  aCtx.putImageData(albImg, 0, 0);

  const curbNorm = buildNormalCanvasFromHeightBuffer(heightBuf, w, h, 2.5);
  const curbOrm = createPackedOrmDataTexture(aoBuf, roughBuf, 255, heightBuf, w, h, {
    repeatX: 1,
    repeatY: 1,
    anisotropy: 8,
  });

  // Concrete Gutter Pan Texture (512x512, weathered concrete #9a968e with subtle curb-side runoff shading)
  const gutCanvas = makeCanvas(512, 512);
  const gCtx = gutCanvas.getContext("2d");
  gCtx.drawImage(albCanvas, 0, 0, 512, 512);
  gCtx.fillStyle = "rgba(166, 162, 152, 0.52)";
  gCtx.fillRect(0, 0, 512, 512);
  const gutGrad = gCtx.createLinearGradient(0, 0, 512, 0);
  gutGrad.addColorStop(0.0, "rgba(42, 44, 48, 0.28)");
  gutGrad.addColorStop(0.45, "rgba(120, 118, 112, 0.04)");
  gutGrad.addColorStop(1.0, "rgba(58, 56, 52, 0.34)");
  gCtx.fillStyle = gutGrad;
  gCtx.fillRect(0, 0, 512, 512);
  gCtx.fillStyle = "rgba(72, 70, 65, 0.55)";
  gCtx.fillRect(0, 254, 512, 4);

  // Slotted Cast-Iron Curbside Storm Drain Grate (512x512)
  const grateAlb = makeCanvas(512, 512);
  const grCtx = grateAlb.getContext("2d");
  grCtx.fillStyle = "#31343a";
  grCtx.fillRect(0, 0, 512, 512);
  grCtx.strokeStyle = "#484d56";
  grCtx.lineWidth = 22;
  grCtx.strokeRect(14, 14, 484, 484);

  const grateH = new Uint8Array(512 * 512);
  grateH.fill(190);
  // 2 columns x 7 dark slotted drainage openings
  for (let col = 0; col < 2; col++) {
    const sx = col === 0 ? 58 : 274;
    const sw = 180;
    for (let row = 0; row < 7; row++) {
      const sy = 44 + row * 62;
      const sh = 36;
      grCtx.fillStyle = "#080a0e";
      grCtx.fillRect(sx, sy, sw, sh);
      grCtx.strokeStyle = "#525863";
      grCtx.lineWidth = 3;
      grCtx.strokeRect(sx, sy, sw, sh);
      for (let py = sy; py < sy + sh; py++) {
        for (let px = sx; px < sx + sw; px++) {
          grateH[py * 512 + px] = 24;
        }
      }
    }
  }
  const grateNorm = buildNormalCanvasFromHeightBuffer(grateH, 512, 512, 3.0);

  return {
    curbMap: finalizeTexture(albCanvas, { repeatX: 1, repeatY: 1, srgb: true, anisotropy: 12 }),
    curbNormal: finalizeTexture(curbNorm, { repeatX: 1, repeatY: 1, srgb: false, anisotropy: 8 }),
    curbOrm,
    curbRough: curbOrm,
    gutterMap: finalizeTexture(gutCanvas, { repeatX: 1, repeatY: 1, srgb: true, anisotropy: 8 }),
    grateMap: finalizeTexture(grateAlb, { repeatX: 1, repeatY: 1, srgb: true, anisotropy: 8, clamp: true }),
    grateNormal: finalizeTexture(grateNorm, { repeatX: 1, repeatY: 1, srgb: false, anisotropy: 8, clamp: true }),
  };
}

/**
 * 4. Weathered Matte California Thermoplastic Road Markings (`512x512` V6):
 *    - Sun-faded matte ochre-yellow (`#CFA23E`) & weathered warm off-white (`#D8D5CC`),
 *      `roughness: 0.86` with asphalt `#525458` aggregate chip-through & tire-wear grain —
 *      ZERO neon yellow/white glow (`emissiveIntensity: 0.0`, `metalness: 0.0`)!
 */
function buildThermoplasticMarkingsSuite() {
  const grit = buildTileableNoiseTable(256, 0x77c12a09);
  const macro = buildTileableNoiseTable(64, 0x77c12a10);
  const wearNoise = buildTileableNoiseTable(128, 0x77c12a15);
  const w = 512;
  const h = 512;

  const whiteC = makeCanvas(w, h);
  const wCtx = whiteC.getContext("2d");
  const wImg = wCtx.createImageData(w, h);
  const yellowC = makeCanvas(w, h);
  const yCtx = yellowC.getContext("2d");
  const yImg = yCtx.createImageData(w, h);
  const bumpBuf = new Uint8Array(w * h);
  const roughBuf = new Uint8Array(w * h);
  const aoBuf = new Uint8Array(w * h);

  // Underlying sun-aged asphalt aggregate tone (#525458 -> 82, 84, 88) for paint wear-through
  const aspR = 82.0;
  const aspG = 84.0;
  const aspB = 88.0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = grit[((y & 255) << 8) + (x & 255)];
      const m = sampleBilinearTile(macro, 64, (x / w) * 8.0, (y / h) * 8.0);
      const wr = sampleBilinearTile(wearNoise, 128, (x / w) * 18.0, (y / h) * 6.0);

      // ~9% aggregate chip-through + weathered tire-scuff patina (fused onto #525458 asphalt)
      const chip = g < 0.068 ? 0.68 : wr < 0.18 ? (0.18 - wr) * 2.1 : 0.0;
      const paintKeep = THREE.MathUtils.clamp(1.0 - chip - (1.0 - m) * 0.12, 0.28, 1.0);
      const bead = (g - 0.5) * 11.0 + (m - 0.5) * 7.0;

      const idx = y * w + x;
      const p = idx * 4;

      // Matte weathered white (#D8D5CC -> 216, 213, 204) blended with #525458 chip-through
      const wR = THREE.MathUtils.lerp(aspR, 216.0 + bead, paintKeep);
      const wG = THREE.MathUtils.lerp(aspG, 213.0 + bead * 0.98, paintKeep);
      const wB = THREE.MathUtils.lerp(aspB, 204.0 + bead * 0.94, paintKeep);
      wImg.data[p] = Math.round(THREE.MathUtils.clamp(wR, 74, 232));
      wImg.data[p + 1] = Math.round(THREE.MathUtils.clamp(wG, 76, 229));
      wImg.data[p + 2] = Math.round(THREE.MathUtils.clamp(wB, 78, 222));
      wImg.data[p + 3] = 255;

      // Matte weathered ochre-yellow (#CFA23E -> 207, 162, 62) blended with #525458 chip-through
      const yR = THREE.MathUtils.lerp(aspR, 207.0 + bead * 0.95, paintKeep);
      const yG = THREE.MathUtils.lerp(aspG, 162.0 + bead * 0.78, paintKeep);
      const yB = THREE.MathUtils.lerp(aspB, 62.0 + bead * 0.45, paintKeep);
      yImg.data[p] = Math.round(THREE.MathUtils.clamp(yR, 76, 224));
      yImg.data[p + 1] = Math.round(THREE.MathUtils.clamp(yG, 74, 182));
      yImg.data[p + 2] = Math.round(THREE.MathUtils.clamp(yB, 52, 86));
      yImg.data[p + 3] = 255;

      bumpBuf[idx] = Math.round(THREE.MathUtils.clamp(78.0 + paintKeep * 96.0 + (g - 0.5) * 44.0, 32, 236));
      // Near-unit roughness modulator [0.95..1.00] paired with scalar roughness = 0.86 -> [0.82..0.86]
      roughBuf[idx] = Math.round(
        THREE.MathUtils.clamp(0.96 + (1.0 - paintKeep) * 0.04 + (g - 0.5) * 0.05, 0.93, 1.0) * 255
      );
      aoBuf[idx] = Math.round(THREE.MathUtils.clamp(210.0 + paintKeep * 45.0, 196, 255));
    }
  }
  wCtx.putImageData(wImg, 0, 0);
  yCtx.putImageData(yImg, 0, 0);

  const normalC = buildNormalCanvasFromHeightBuffer(bumpBuf, w, h, 1.65);
  const ormMap = createPackedOrmDataTexture(aoBuf, roughBuf, 0, bumpBuf, w, h, {
    repeatX: 2,
    repeatY: 2,
    anisotropy: 8,
  });

  return {
    whiteMap: finalizeTexture(whiteC, { repeatX: 2, repeatY: 2, srgb: true, anisotropy: 8 }),
    yellowMap: finalizeTexture(yellowC, { repeatX: 2, repeatY: 2, srgb: true, anisotropy: 8 }),
    normalMap: finalizeTexture(normalC, { repeatX: 2, repeatY: 2, srgb: false, anisotropy: 8 }),
    bumpMap: null,
    ormMap,
    aoMap: ormMap,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
  };
}

/**
 * 5. Rich Multi-Layered Botanical Meadow / Fescue Turf & Dark Loam Soil PBR Suite (`1024x1024`):
 *    - Natural olive, clover, emerald, sun-warmed golden tips & dark soil micro-shadowing
 *      (`#385929`, `#476c32`, `#587d3c`, `#2d4821` — ZERO neon `#00ff00` CG green!).
 */
function buildTurfLawnPbrSuite() {
  const rng = createSeededRNG(0x64a55199);
  const patchGrid = buildTileableNoiseTable(64, 0x38592901);
  const tuftGrid = buildTileableNoiseTable(256, 0x38592902);
  const fineGrid = buildTileableNoiseTable(512, 0x38592903);

  const w = 1024;
  const h = 1024;
  const heightBuf = new Uint8Array(w * h);
  const roughBuf = new Uint8Array(w * h);
  const aoBuf = new Uint8Array(w * h);

  const albC = makeCanvas(w, h);
  const aCtx = albC.getContext("2d");
  const albImg = aCtx.createImageData(w, h);
  const albData = albImg.data;

  // Base loam soil + deep root AO + lush mowed olive-emerald turf variation (VETO-3D-01: zero pale tan ground!)
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const patch = sampleBilinearTile(patchGrid, 64, u * 6.0, v * 6.0);
      const tuft = sampleBilinearTile(tuftGrid, 256, u * 36.0, v * 36.0);
      const fine = fineGrid[((y & 511) << 9) + (x & 511)];

      // Rich mowed olive-emerald fescue underlayer (#28421B .. #3A4E1E .. #4E6026) matching 624k 3D tufts
      const canopy = THREE.MathUtils.clamp(tuft * 0.62 + fine * 0.38, 0.0, 1.0);
      const goldenPatch = Math.max(0.0, patch - 0.56) * 1.15;

      let r = 36.0 + canopy * 34.0 + goldenPatch * 12.0 + (patch - 0.5) * 8.0;
      let g = 54.0 + canopy * 38.0 + goldenPatch * 10.0 + (patch - 0.5) * 9.0;
      let b = 20.0 + canopy * 14.0 + goldenPatch * 2.0 + (patch - 0.5) * 4.0;

      // Occasional deep rich root-crown AO pockets (#213417) between fescue tufts
      if (canopy < 0.24) {
        const sMix = (0.24 - canopy) / 0.24;
        r = r * (1.0 - sMix * 0.38) + 33.0 * (sMix * 0.38);
        g = g * (1.0 - sMix * 0.38) + 50.0 * (sMix * 0.38);
        b = b * (1.0 - sMix * 0.38) + 21.0 * (sMix * 0.38);
      }

      const idx = y * w + x;
      const p = idx * 4;
      albData[p] = Math.max(26, Math.min(82, Math.round(r)));
      albData[p + 1] = Math.max(44, Math.min(104, Math.round(g)));
      albData[p + 2] = Math.max(17, Math.min(44, Math.round(b)));
      albData[p + 3] = 255;

      heightBuf[idx] = Math.max(16, Math.min(242, Math.round(78.0 + canopy * 148.0)));
      roughBuf[idx] = Math.round(THREE.MathUtils.clamp(0.94 - canopy * 0.06, 0.88, 0.95) * 255.0);
      aoBuf[idx] = Math.max(142, Math.min(255, Math.round(168.0 + canopy * 87.0)));
    }
  }
  aCtx.putImageData(albImg, 0, 0);

  // Layer 7,200 crisp overlapping individual grass-blade strokes (wrapped seamlessly!) into albedo & height
  const bladePalette = ["#263f1b", "#314f23", "#3d5e2b", "#496c33", "#537638", "#42632d"];
  for (let i = 0; i < 7200; i++) {
    const bx = rng() * w;
    const by = rng() * h;
    const ang = -Math.PI * 0.5 + (rng() - 0.5) * 1.65;
    const len = 5.5 + rng() * 10.5;
    const tipX = bx + Math.cos(ang) * len;
    const tipY = by + Math.sin(ang) * len;
    const col = bladePalette[Math.floor(rng() * bladePalette.length)];
    aCtx.strokeStyle = col;
    aCtx.lineWidth = 1.15 + rng() * 1.1;
    aCtx.lineCap = "round";
    for (const ox of [-w, 0, w]) {
      if (bx + ox < -16 || bx + ox > w + 16) continue;
      for (const oy of [-h, 0, h]) {
        if (by + oy < -16 || by + oy > h + 16) continue;
        aCtx.beginPath();
        aCtx.moveTo(bx + ox, by + oy);
        aCtx.lineTo(tipX + ox, tipY + oy);
        aCtx.stroke();
      }
    }
    const midX = Math.floor((bx + tipX) * 0.5) & (w - 1);
    const midY = Math.floor((by + tipY) * 0.5) & (h - 1);
    heightBuf[midY * w + midX] = Math.min(252, heightBuf[midY * w + midX] + 38);
  }

  const normalC = buildNormalCanvasFromHeightBuffer(heightBuf, w, h, 2.1);
  const ormMap = createPackedOrmDataTexture(aoBuf, roughBuf, 0, heightBuf, w, h, {
    repeatX: 1,
    repeatY: 1,
    anisotropy: 8,
  });

  return {
    map: finalizeTexture(albC, { repeatX: 1, repeatY: 1, srgb: true, anisotropy: 12 }),
    normalMap: finalizeTexture(normalC, { repeatX: 1, repeatY: 1, srgb: false, anisotropy: 8 }),
    bumpMap: null,
    ormMap,
    aoMap: ormMap,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
  };
}

/**
 * 6. Soft Elliptical Vehicle & Building Contact AO Shadow Decal Textures +
 *    Warm Brass/Travertine Sidewalk MK Patio Rug + Rising Espresso Steam Puff Wisp.
 */
function buildVehicleContactShadowTexture() {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 256, 256);

  // Soft elliptical under-chassis ambient occlusion core
  ctx.save();
  ctx.translate(128, 128);
  ctx.scale(0.84, 1.0);
  const bodyGrad = ctx.createRadialGradient(0, 0, 14, 0, 0, 118);
  bodyGrad.addColorStop(0.0, "rgba(8, 11, 16, 0.78)");
  bodyGrad.addColorStop(0.52, "rgba(10, 14, 20, 0.54)");
  bodyGrad.addColorStop(0.80, "rgba(12, 16, 24, 0.18)");
  bodyGrad.addColorStop(1.0, "rgba(12, 16, 24, 0.0)");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 118, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 4 dense tire-contact AO darkening lobes so wheels look 100% planted on dark asphalt
  for (const [tx, ty] of [
    [68, 66],
    [188, 66],
    [68, 190],
    [188, 190],
  ]) {
    const wg = ctx.createRadialGradient(tx, ty, 2, tx, ty, 30);
    wg.addColorStop(0.0, "rgba(5, 7, 10, 0.65)");
    wg.addColorStop(0.55, "rgba(8, 11, 16, 0.28)");
    wg.addColorStop(1.0, "rgba(8, 11, 16, 0.0)");
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.arc(tx, ty, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  return finalizeTexture(c, { srgb: true, anisotropy: 4, clamp: true });
}

function buildMkPatioRugTexture() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 512);

  const cx = 256;
  const cy = 256;
  // Warm woven cafe sisal/travertine medallion with brushed golden-brass inlay rings (ZERO green!)
  const bg = ctx.createRadialGradient(cx, cy, 18, cx, cy, 244);
  bg.addColorStop(0.0, "rgba(238, 226, 202, 0.96)");
  bg.addColorStop(0.76, "rgba(218, 199, 166, 0.95)");
  bg.addColorStop(0.92, "rgba(184, 146, 78, 0.94)");
  bg.addColorStop(0.97, "rgba(92, 68, 38, 0.65)");
  bg.addColorStop(1.0, "rgba(92, 68, 38, 0.0)");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, 244, 0, Math.PI * 2);
  ctx.fill();

  // Concentric brushed-brass border rings
  for (const [r, wLine, col] of [
    [224, 9, "#d4af37"],
    [206, 3.5, "#8b6914"],
    [146, 4.5, "#c59b27"],
  ]) {
    ctx.strokeStyle = col;
    ctx.lineWidth = wLine;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  return finalizeTexture(c, { srgb: true, anisotropy: 8, clamp: true });
}

function buildEspressoSteamTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  g.addColorStop(0.0, "rgba(255, 252, 246, 0.56)");
  g.addColorStop(0.45, "rgba(248, 246, 242, 0.28)");
  g.addColorStop(0.80, "rgba(244, 242, 238, 0.08)");
  g.addColorStop(1.0, "rgba(244, 242, 238, 0.0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return finalizeTexture(c, { srgb: true, anisotropy: 2, clamp: true });
}

function buildAdaTactileDomeMaps() {
  const w = 256;
  const h = 256;
  const alb = makeCanvas(w, h);
  const aCtx = alb.getContext("2d");
  // Weathered matte architectural ADA ochre-gold (#C59B34 — zero neon yellow!)
  aCtx.fillStyle = "#c59b34";
  aCtx.fillRect(0, 0, w, h);
  aCtx.strokeStyle = "#9d7924";
  aCtx.lineWidth = 6;
  aCtx.strokeRect(4, 4, w - 8, h - 8);

  const hBuf = new Uint8Array(w * h);
  hBuf.fill(110);
  const cols = 10;
  const step = w / cols;
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * step;
      const cy = (r + 0.5) * step;
      aCtx.fillStyle = "#d4ad4a";
      aCtx.beginPath();
      aCtx.arc(cx - 1.2, cy - 1.2, 5.4, 0, Math.PI * 2);
      aCtx.fill();
      aCtx.strokeStyle = "#8c6b1f";
      aCtx.lineWidth = 1.4;
      aCtx.beginPath();
      aCtx.arc(cx, cy, 5.8, 0, Math.PI * 2);
      aCtx.stroke();

      for (let dy = -7; dy <= 7; dy++) {
        for (let dx = -7; dx <= 7; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 <= 42) {
            const px = Math.min(w - 1, Math.max(0, Math.round(cx + dx)));
            const py = Math.min(h - 1, Math.max(0, Math.round(cy + dy)));
            hBuf[py * w + px] = Math.round(110 + (1.0 - d2 / 42.0) * 135.0);
          }
        }
      }
    }
  }
  const norm = buildNormalCanvasFromHeightBuffer(hBuf, w, h, 2.2);
  return {
    map: finalizeTexture(alb, { repeatX: 2, repeatY: 2, srgb: true, anisotropy: 8 }),
    normalMap: finalizeTexture(norm, { repeatX: 2, repeatY: 2, srgb: false, anisotropy: 8 }),
  };
}

function buildUnitWhiteDataTexture() {
  const data = new Uint8Array(4 * 4 * 4);
  data.fill(255);
  const tex = new THREE.DataTexture(data, 4, 4, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildOpenCampusMaterials() {
  const aspRng = createSeededRNG(0xa5f417);
  const asphaltSuite = buildAsphaltPbrSuite();
  const limestonePaversSuite = buildArchitecturalLimestonePaversSuite();
  const visitorHexPaversSuite = buildVisitorHexPaversPbrSuite();
  const boardFormedConcreteSuite = buildBoardFormedConcretePbrSuite();
  const dragonscaleSolarSuite = buildDragonscaleSolarPbrSuite();
  const redwoodBarkSuite = buildCoastRedwoodBarkPbrSuite();
  const microGrainSuite = getPropMicroGrainSuite();
  const unitWhiteMetalMap = buildUnitWhiteDataTexture();
  const sidewalkSuite = buildConcreteSidewalkPbrSuite();
  const curbGutterSuite = buildGraniteCurbAndGutterSuite();
  const stripeSuite = buildThermoplasticMarkingsSuite();
  const turfSuite = buildTurfLawnPbrSuite();
  const adaSuite = buildAdaTactileDomeMaps();
  const vehicleShadowTex = buildVehicleContactShadowTexture();
  const mkPatioRugTex = buildMkPatioRugTexture();
  const espressoSteamTex = buildEspressoSteamTexture();

  // Monocrystalline Solar Carport PV Grid Texture
  const pvCanvas = makeCanvas(256, 256);
  const pCtx = pvCanvas.getContext("2d");
  pCtx.fillStyle = "#122646";
  pCtx.fillRect(0, 0, 256, 256);
  pCtx.strokeStyle = "#6e88ad";
  pCtx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const p = i * 32;
    pCtx.beginPath();
    pCtx.moveTo(p, 0);
    pCtx.lineTo(p, 256);
    pCtx.moveTo(0, p);
    pCtx.lineTo(256, p);
    pCtx.stroke();
  }
  const pvTex = finalizeTexture(pvCanvas, { repeatX: 4, repeatY: 2, srgb: true });

  // V7 Spin Studio Dark Charcoal Speckled Vulcanized EPDM Gym Rubber Tile (`1024x1024`, repeat 14x14)
  // Matches Omni Zone 1 (`zone1_mid.png`): `#343538` dark charcoal rubber with subtle grey/cream EPDM flecks
  // and Packed ORM (`R=AO, G=Roughness [0.65..0.88], B=Metalness 0, A=Height`) so sunbeams & shadows pop!
  const gymW = 1024;
  const gymH = 1024;
  const gymCanvas = makeCanvas(gymW, gymH);
  const gCtx = gymCanvas.getContext("2d");
  const gymHeightBuf = new Uint8Array(gymW * gymH);
  const gymRoughBuf = new Uint8Array(gymW * gymH);
  const gymAoBuf = new Uint8Array(gymW * gymH);
  const gymNoise = buildTileableNoiseTable(256, 0x34353811);
  const gymScuffGrid = buildTileableNoiseTable(64, 0x34353822);

  const gymImg = gCtx.createImageData(gymW, gymH);
  const gymData = gymImg.data;
  const tileSize = 256; // 4x4 precision bevel-seamed vulcanized rubber tiles per 1024px sheet
  for (let y = 0; y < gymH; y++) {
    const ty = Math.floor(y / tileSize);
    const ly = y % tileSize;
    const seamDistY = Math.min(ly, tileSize - 1 - ly);
    const v = y / gymH;
    for (let x = 0; x < gymW; x++) {
      const tx = Math.floor(x / tileSize);
      const lx = x % tileSize;
      const seamDistX = Math.min(lx, tileSize - 1 - lx);
      const seamDist = Math.min(seamDistX, seamDistY);
      const u = x / gymW;

      const tileTone = (((tx * 7 + ty * 13) % 5) - 2) * 1.1;
      const micro = sampleBilinearTile(gymNoise, 256, u * 64.0, v * 64.0);
      const scuff = sampleBilinearTile(gymScuffGrid, 64, u * 10.0, v * 10.0);
      const fine = gymNoise[((y & 255) << 8) + (x & 255)];

      // Dark charcoal vulcanized EPDM rubber base (#343538 -> 52, 53, 56)
      let r = 52.0 + tileTone + (micro - 0.5) * 7.5 + (fine - 0.5) * 6.5 + (scuff - 0.5) * 4.0;
      let g = 53.0 + tileTone + (micro - 0.5) * 7.5 + (fine - 0.5) * 6.5 + (scuff - 0.5) * 4.0;
      let b = 56.0 + tileTone * 1.05 + (micro - 0.5) * 8.0 + (fine - 0.5) * 6.8 + (scuff - 0.5) * 4.2;

      let hVal = 136.0 + (fine - 0.5) * 48.0 + (micro - 0.5) * 24.0;
      // Scuff + vulcanized rubber micro-grain roughness spanning [0.65..0.88]
      const scuffPolish = Math.max(0.0, scuff - 0.55) * 0.28;
      let rVal = 0.80 + (0.5 - fine) * 0.14 + (0.5 - micro) * 0.08 - scuffPolish;
      let aoVal = 246.0 + (micro - 0.5) * 14.0;

      // Subtle micro-beveled tile seam
      if (seamDist < 2) {
        const sFactor = seamDist === 0 ? 0.78 : 0.90;
        r *= sFactor;
        g *= sFactor;
        b *= sFactor;
        hVal -= seamDist === 0 ? 52.0 : 24.0;
        rVal = 0.88;
        aoVal = seamDist === 0 ? 156.0 : 196.0;
      }

      const idx = y * gymW + x;
      const p = idx * 4;
      gymData[p] = Math.max(34, Math.min(78, Math.round(r)));
      gymData[p + 1] = Math.max(35, Math.min(80, Math.round(g)));
      gymData[p + 2] = Math.max(38, Math.min(84, Math.round(b)));
      gymData[p + 3] = 255;
      gymHeightBuf[idx] = Math.max(16, Math.min(246, Math.round(hVal)));
      gymRoughBuf[idx] = Math.round(THREE.MathUtils.clamp(rVal, 0.65, 0.88) * 255.0);
      gymAoBuf[idx] = Math.max(128, Math.min(255, Math.round(aoVal)));
    }
  }
  gCtx.putImageData(gymImg, 0, 0);

  // Subtle grey & warm cream vulcanized EPDM flecks matching Omni Zone 1 (#343538 base + sparse crisp flecks)
  const epdmFlecks = ["#5A5C61", "#6D7076", "#878A90", "#B4B0A6", "#CBC6BA"];
  for (let i = 0; i < 11500; i++) {
    gCtx.fillStyle = epdmFlecks[Math.floor(aspRng() * epdmFlecks.length)];
    gCtx.globalAlpha = 0.28 + aspRng() * 0.34;
    const fx = aspRng() * gymW;
    const fy = aspRng() * gymH;
    const sz = 0.95 + aspRng() * 1.25;
    gCtx.fillRect(fx, fy, sz, sz);
  }
  gCtx.globalAlpha = 1.0;
  const gymTex = finalizeTexture(gymCanvas, { repeatX: 14, repeatY: 14, srgb: true, anisotropy: 12 });
  const gymNormalMap = finalizeTexture(buildNormalCanvasFromHeightBuffer(gymHeightBuf, gymW, gymH, 1.55), {
    repeatX: 14,
    repeatY: 14,
    srgb: false,
    anisotropy: 8,
  });
  const gymOrmMap = createPackedOrmDataTexture(gymAoBuf, gymRoughBuf, 0, gymHeightBuf, gymW, gymH, {
    repeatX: 14,
    repeatY: 14,
    anisotropy: 8,
  });

  // Warm Golden-Honey Maple Athletic Studio Strip Flooring (`512x512` staggered hardwood planks)
  const mapleCanvas = makeCanvas(512, 512);
  const mCtx = mapleCanvas.getContext("2d");
  mCtx.fillStyle = "#b98552";
  mCtx.fillRect(0, 0, 512, 512);
  const stripRows = 16;
  const stripH = 512 / stripRows;
  for (let r = 0; r < stripRows; r++) {
    const y = r * stripH;
    let xCursor = -((r * 97) % 160);
    while (xCursor < 512) {
      const plankW = 140 + Math.floor(aspRng() * 110);
      const red = 182 + Math.floor((aspRng() - 0.5) * 28);
      const grn = 128 + Math.floor((aspRng() - 0.5) * 24);
      const blu = 76 + Math.floor((aspRng() - 0.5) * 18);
      mCtx.fillStyle = `rgb(${red},${grn},${blu})`;
      mCtx.fillRect(xCursor, y, plankW - 1.2, stripH - 1.2);
      mCtx.strokeStyle = `rgba(${red - 26},${grn - 22},${blu - 14},0.22)`;
      mCtx.lineWidth = 1.1;
      for (let g = 0; g < 3; g++) {
        const gy = y + 4 + aspRng() * (stripH - 8);
        mCtx.beginPath();
        mCtx.moveTo(xCursor + 2, gy);
        mCtx.bezierCurveTo(
          xCursor + plankW * 0.33,
          gy + (aspRng() - 0.5) * 4,
          xCursor + plankW * 0.66,
          gy + (aspRng() - 0.5) * 4,
          xCursor + plankW - 2,
          gy
        );
        mCtx.stroke();
      }
      mCtx.strokeStyle = "rgba(68, 42, 20, 0.45)";
      mCtx.lineWidth = 1.3;
      mCtx.strokeRect(xCursor, y, plankW, stripH);
      xCursor += plankW;
    }
  }
  const gymMapleTex = finalizeTexture(mapleCanvas, { repeatX: 5, repeatY: 4, srgb: true, anisotropy: 8 });

  // Procedural California Santa Cruz Mountains Coast Live-Oak & Golden Oatgrass Foothills (`512x256`)
  const chapCanvas = makeCanvas(512, 256);
  const chapBumpCanvas = makeCanvas(512, 256);
  const chCtx = chapCanvas.getContext("2d");
  const chBCtx = chapBumpCanvas.getContext("2d");
  const chGrad = chCtx.createLinearGradient(0, 256, 0, 0);
  chGrad.addColorStop(0.0, "#7b8459");
  chGrad.addColorStop(0.38, "#b79c66");
  chGrad.addColorStop(0.74, "#d6ba84");
  chGrad.addColorStop(1.0, "#e9d4ad");
  chCtx.fillStyle = chGrad;
  chCtx.fillRect(0, 0, 512, 256);
  chBCtx.fillStyle = "#808080";
  chBCtx.fillRect(0, 0, 512, 256);
  for (let band = 0; band < 7; band++) {
    const baseY = 58 + band * 26;
    chCtx.fillStyle = band % 2 === 0 ? "rgba(74, 86, 52, 0.16)" : "rgba(218, 178, 112, 0.14)";
    chCtx.beginPath();
    chCtx.moveTo(0, 256);
    for (let x = 0; x <= 512; x += 16) {
      const ang = (x / 512) * Math.PI * 2.0;
      const wy =
        baseY +
        Math.sin(ang * (2 + (band % 2)) + band * 1.1) * 14 +
        Math.cos(ang * 5 + band * 0.7) * 6;
      chCtx.lineTo(x, wy);
    }
    chCtx.lineTo(512, 256);
    chCtx.closePath();
    chCtx.fill();
  }
  const oakTones = ["#3b4d2b", "#495d34", "#586d3f", "#6b7c4c", "#868f5c"];
  for (let i = 0; i < 980; i++) {
    const vFrac = Math.pow(aspRng(), 0.68);
    const cy = 22 + vFrac * 228;
    const cx = aspRng() * 512;
    const rad = 2.6 + aspRng() * 6.8 * (0.65 + 0.55 * vFrac);
    const tone = oakTones[Math.min(oakTones.length - 1, Math.floor(aspRng() * oakTones.length))];
    for (const ox of [0, -512, 512]) {
      if (cx + ox < -18 || cx + ox > 530) continue;
      chCtx.fillStyle = "rgba(32, 42, 24, 0.16)";
      chCtx.beginPath();
      chCtx.ellipse(cx + ox + 1.4, cy + 1.6, rad * 1.35, rad * 0.68, 0, 0, Math.PI * 2);
      chCtx.fill();
      chCtx.fillStyle = tone;
      chCtx.globalAlpha = 0.22 + 0.26 * vFrac;
      chCtx.beginPath();
      chCtx.ellipse(cx + ox, cy, rad * 1.3, rad * 0.65, 0, 0, Math.PI * 2);
      chCtx.fill();
      chBCtx.fillStyle = "rgba(192, 192, 192, 0.28)";
      chBCtx.beginPath();
      chBCtx.ellipse(cx + ox, cy, rad * 1.2, rad * 0.62, 0, 0, Math.PI * 2);
      chBCtx.fill();
    }
  }
  chCtx.globalAlpha = 1.0;
  const chaparralFoothillsMap = finalizeTexture(chapCanvas, { repeatX: 1.5, repeatY: 1.0, srgb: true });
  chaparralFoothillsMap.wrapT = THREE.ClampToEdgeWrapping;
  const chaparralFoothillsBump = finalizeTexture(chapBumpCanvas, { repeatX: 1.5, repeatY: 1.0, srgb: false });
  chaparralFoothillsBump.wrapT = THREE.ClampToEdgeWrapping;

  const roadAsphaltMat = new THREE.MeshStandardMaterial({
    name: "V7_Asphalt_Aggregate_Boulder",
    color: "#ffffff",
    map: asphaltSuite.map,
    normalMap: asphaltSuite.normalMap,
    normalScale: new THREE.Vector2(0.88, 0.88),
    aoMap: asphaltSuite.ormMap,
    aoMapIntensity: 0.55,
    roughnessMap: asphaltSuite.ormMap,
    metalnessMap: asphaltSuite.ormMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.20,
  });

  const limestonePlazaPaversMat = new THREE.MeshStandardMaterial({
    name: "V7_Limestone_Planter_Pavers",
    color: "#ffffff",
    map: limestonePaversSuite.map,
    normalMap: limestonePaversSuite.normalMap,
    normalScale: new THREE.Vector2(0.92, 0.92),
    aoMap: limestonePaversSuite.ormMap,
    aoMapIntensity: 0.65,
    roughnessMap: limestonePaversSuite.ormMap,
    metalnessMap: limestonePaversSuite.ormMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.28,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  limestonePlazaPaversMat.userData.v7PomScale = 0.012;

  const visitorHexPaversMat = new THREE.MeshStandardMaterial({
    name: "V7_Visitor_Hex_Planter_Pavers",
    color: "#ffffff",
    map: visitorHexPaversSuite.map,
    normalMap: visitorHexPaversSuite.normalMap,
    normalScale: new THREE.Vector2(0.90, 0.90),
    aoMap: visitorHexPaversSuite.ormMap,
    aoMapIntensity: 0.68,
    roughnessMap: visitorHexPaversSuite.ormMap,
    metalnessMap: visitorHexPaversSuite.ormMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.28,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  visitorHexPaversMat.userData.v7PomScale = 0.011;

  const boardFormedConcreteMat = new THREE.MeshStandardMaterial({
    name: "V7_BoardFormed_Planter_Concrete",
    color: "#F3F1EB",
    map: boardFormedConcreteSuite.map,
    normalMap: boardFormedConcreteSuite.normalMap,
    normalScale: new THREE.Vector2(0.84, 0.84),
    aoMap: boardFormedConcreteSuite.ormMap,
    aoMapIntensity: 0.65,
    roughnessMap: boardFormedConcreteSuite.ormMap,
    metalnessMap: boardFormedConcreteSuite.ormMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.30,
  });
  boardFormedConcreteMat.userData.v7PomScale = 0.012;

  const brushedStainlessBollardMat = new THREE.MeshStandardMaterial({
    name: "V7_Canopy_BrushedStainlessBollard",
    color: "#AEB4BA",
    normalMap: microGrainSuite.steelNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    aoMap: microGrainSuite.steelOrm,
    aoMapIntensity: 0.42,
    roughnessMap: microGrainSuite.steelOrm,
    metalnessMap: microGrainSuite.steelOrm,
    roughness: 1.0,
    metalness: 0.78,
    envMapIntensity: 1.05,
  });

  const canopyWhiteSteelTrussMat = new THREE.MeshStandardMaterial({
    name: "V7_Canopy_WhiteSteelTruss",
    color: "#E2E4E6",
    normalMap: microGrainSuite.fiberglassNormal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    aoMap: microGrainSuite.fiberglassUnitOrm,
    aoMapIntensity: 0.36,
    roughnessMap: microGrainSuite.fiberglassUnitOrm,
    metalnessMap: microGrainSuite.fiberglassUnitOrm,
    roughness: 0.52,
    metalness: 0.18,
    envMapIntensity: 0.58,
  });

  const concreteSidewalkMat = new THREE.MeshStandardMaterial({
    name: "V7_Sidewalk_Planter_Concrete",
    color: "#ffffff",
    map: sidewalkSuite.map,
    normalMap: sidewalkSuite.normalMap,
    normalScale: new THREE.Vector2(0.68, 0.68),
    aoMap: sidewalkSuite.ormMap,
    aoMapIntensity: 0.58,
    roughnessMap: sidewalkSuite.ormMap,
    metalnessMap: sidewalkSuite.ormMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.34,
  });
  concreteSidewalkMat.userData.v7PomScale = 0.009;

  const graniteCurbMat = new THREE.MeshStandardMaterial({
    name: "V7_GraniteCurb_Boulder",
    color: "#ffffff",
    map: curbGutterSuite.curbMap,
    normalMap: curbGutterSuite.curbNormal,
    normalScale: new THREE.Vector2(0.76, 0.76),
    aoMap: curbGutterSuite.curbOrm,
    aoMapIntensity: 0.62,
    roughnessMap: curbGutterSuite.curbOrm,
    metalnessMap: curbGutterSuite.curbOrm,
    roughness: 1.0,
    metalness: 0.02,
    envMapIntensity: 0.38,
  });

  const concreteGutterMat = new THREE.MeshStandardMaterial({
    name: "V7_ConcreteGutter_Boulder",
    color: "#ffffff",
    map: curbGutterSuite.gutterMap,
    normalMap: curbGutterSuite.curbNormal,
    normalScale: new THREE.Vector2(0.48, 0.48),
    aoMap: curbGutterSuite.curbOrm,
    aoMapIntensity: 0.55,
    roughnessMap: curbGutterSuite.curbOrm,
    metalnessMap: curbGutterSuite.curbOrm,
    roughness: 0.96,
    metalness: 0.0,
    envMapIntensity: 0.34,
  });

  const stormGrateIronMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: curbGutterSuite.grateMap,
    normalMap: curbGutterSuite.grateNormal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.56,
    metalness: 0.62,
    envMapIntensity: 0.62,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const turfLawnPbrMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: turfSuite.map,
    normalMap: turfSuite.normalMap,
    normalScale: new THREE.Vector2(0.58, 0.58),
    aoMap: turfSuite.ormMap,
    aoMapIntensity: 0.58,
    roughnessMap: turfSuite.ormMap,
    metalnessMap: turfSuite.ormMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.16,
  });

  const gymBronzeMullionMat = new THREE.MeshStandardMaterial({
    color: "#2E2822",
    emissive: "#080605",
    emissiveIntensity: 0.02,
    roughness: 0.46,
    metalness: 0.68,
    envMapIntensity: 0.52,
  });

  const shorelineBasaltStoneMat = new THREE.MeshStandardMaterial({
    color: "#3A3E44",
    roughness: 0.84,
    metalness: 0.03,
    envMapIntensity: 0.32,
  });

  const shorelineKeynotePedestalPbrMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: "#d8d4cc",
    roughness: 0.84,
    metalness: 0.02,
    envMapIntensity: 0.36,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  return {
    _suites: {
      asphaltSuite,
      limestonePaversSuite,
      visitorHexPaversSuite,
      boardFormedConcreteSuite,
      dragonscaleSolarSuite,
      redwoodBarkSuite,
      sidewalkSuite,
      curbGutterSuite,
      turfSuite,
      microGrainSuite,
      unitWhiteMetalMap,
      stripeSuite,
    },
    _textures: {
      roadAsphaltMap: asphaltSuite.map,
      roadAsphaltNormal: asphaltSuite.normalMap,
      roadAsphaltRoughness: asphaltSuite.ormMap,
      roadAsphaltOrm: asphaltSuite.ormMap,
      sandstonePaversMap: limestonePaversSuite.map,
      sandstonePaversNormal: limestonePaversSuite.normalMap,
      sandstonePaversRoughness: limestonePaversSuite.ormMap,
      sandstonePaversOrm: limestonePaversSuite.ormMap,
      visitorHexPaversMap: visitorHexPaversSuite.map,
      visitorHexPaversNormal: visitorHexPaversSuite.normalMap,
      visitorHexPaversRoughness: visitorHexPaversSuite.ormMap,
      visitorHexPaversOrm: visitorHexPaversSuite.ormMap,
      boardFormedConcreteMap: boardFormedConcreteSuite.map,
      boardFormedConcreteNormal: boardFormedConcreteSuite.normalMap,
      boardFormedConcreteOrm: boardFormedConcreteSuite.ormMap,
      dragonscaleSolarNormal: dragonscaleSolarSuite.normalMap,
      dragonscaleSolarOrm: dragonscaleSolarSuite.ormMap,
      redwoodBarkMap: redwoodBarkSuite.map,
      redwoodBarkNormal: redwoodBarkSuite.normalMap,
      redwoodBarkOrm: redwoodBarkSuite.ormMap,
      concreteSidewalkMap: sidewalkSuite.map,
      concreteSidewalkNormal: sidewalkSuite.normalMap,
      concreteSidewalkOrm: sidewalkSuite.ormMap,
      graniteCurbMap: curbGutterSuite.curbMap,
      graniteCurbOrm: curbGutterSuite.curbOrm,
      turfLawnMap: turfSuite.map,
      turfLawnNormal: turfSuite.normalMap,
      turfLawnBump: null,
      turfLawnRoughness: turfSuite.ormMap,
      turfLawnOrm: turfSuite.ormMap,
      gymRubberMap: gymTex,
      gymRubberNormal: gymNormalMap,
      gymRubberRoughness: gymOrmMap,
      gymRubberOrm: gymOrmMap,
      vehicleShadowTex,
      mkPatioRugTex,
      espressoSteamTex,
      chaparralFoothillsMap,
      chaparralFoothillsBump,
    },
    materials: {
      roadAsphalt: roadAsphaltMat,
      asphaltRoad: roadAsphaltMat,
      sandstonePavers: limestonePlazaPaversMat,
      limestonePavers: limestonePlazaPaversMat,
      visitorHexPavers: visitorHexPaversMat,
      boardFormedConcrete: boardFormedConcreteMat,
      concreteWall: boardFormedConcreteMat,
      brushedStainlessBollard: brushedStainlessBollardMat,
      canopyWhiteSteelTruss: canopyWhiteSteelTrussMat,
      concreteSidewalk: concreteSidewalkMat,
      graniteCurb: graniteCurbMat,
      concreteGutter: concreteGutterMat,
      stormGrateIron: stormGrateIronMat,
      turfLawnPbr: turfLawnPbrMat,
      // Legacy material key preserved as neutral asphalt-safe fallback (zero green road paint!)
      bikeLaneGreen: roadAsphaltMat,
      roadStripeWhite: new THREE.MeshStandardMaterial({
        name: "V7_Thermoplastic_Boulder_WhiteStripe",
        color: "#ffffff",
        map: stripeSuite.whiteMap,
        normalMap: stripeSuite.normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        aoMap: stripeSuite.ormMap,
        aoMapIntensity: 0.45,
        roughnessMap: stripeSuite.ormMap,
        metalnessMap: stripeSuite.ormMap,
        roughness: 0.86,
        metalness: 0.0,
        emissive: "#000000",
        emissiveIntensity: 0.0,
        envMapIntensity: 0.18,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      roadStripeYellow: new THREE.MeshStandardMaterial({
        name: "V7_Thermoplastic_Boulder_YellowStripe",
        color: "#ffffff",
        map: stripeSuite.yellowMap,
        normalMap: stripeSuite.normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        aoMap: stripeSuite.ormMap,
        aoMapIntensity: 0.45,
        roughnessMap: stripeSuite.ormMap,
        metalnessMap: stripeSuite.ormMap,
        roughness: 0.86,
        metalness: 0.0,
        emissive: "#000000",
        emissiveIntensity: 0.0,
        envMapIntensity: 0.18,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      tactileAdaYellow: new THREE.MeshStandardMaterial({
        name: "V7_TactileAda_Boulder_Ochre",
        color: "#ffffff",
        map: adaSuite.map,
        normalMap: adaSuite.normalMap,
        normalScale: new THREE.Vector2(0.75, 0.75),
        roughness: 0.82,
        metalness: 0.0,
        envMapIntensity: 0.24,
      }),
      vehicleContactShadow: new THREE.MeshBasicMaterial({
        map: vehicleShadowTex,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      buildingContactShadow: new THREE.MeshBasicMaterial({
        color: "#0b1017",
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      mkPatioRug: new THREE.MeshStandardMaterial({
        color: "#ffffff",
        map: mkPatioRugTex,
        transparent: true,
        alphaTest: 0.06,
        roughness: 0.82,
        metalness: 0.04,
        envMapIntensity: 0.34,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      espressoSteamWisp: new THREE.MeshBasicMaterial({
        map: espressoSteamTex,
        transparent: true,
        opacity: 0.74,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      gymRubberFloor: new THREE.MeshStandardMaterial({
        name: "V7_EPDM_Planter_RubberFloor",
        color: "#ffffff",
        map: gymTex,
        normalMap: gymNormalMap,
        normalScale: new THREE.Vector2(0.62, 0.62),
        aoMap: gymOrmMap,
        aoMapIntensity: 0.50,
        roughnessMap: gymOrmMap,
        metalnessMap: gymOrmMap,
        roughness: 1.0,
        metalness: 0.0,
        emissive: "#000000",
        emissiveIntensity: 0.0,
        envMapIntensity: 0.34,
      }),
      gymMapleHardwood: new THREE.MeshStandardMaterial({
        color: "#ffffff",
        map: gymMapleTex,
        emissive: "#26180a",
        emissiveIntensity: 0.02,
        roughness: 0.58,
        metalness: 0.02,
        envMapIntensity: 0.42,
      }),
      gymArchitecturalGlass: new THREE.MeshPhysicalMaterial({
        color: "#dcebf7",
        emissive: "#ffe0b2",
        emissiveIntensity: 0.07,
        roughness: 0.07,
        metalness: 0.16,
        transparent: true,
        opacity: 0.30,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      gymBronzeMullion: gymBronzeMullionMat,
      anodizedDarkBronzeMullion: gymBronzeMullionMat,
      shorelineBasaltStone: shorelineBasaltStoneMat,
      shorelineKeynotePedestalPbr: shorelineKeynotePedestalPbrMat,
      breakableTemperedGlass: new THREE.MeshPhysicalMaterial({
        color: "#dcebf7",
        emissive: "#ffe0b2",
        emissiveIntensity: 0.07,
        roughness: 0.07,
        metalness: 0.16,
        transparent: true,
        opacity: 0.30,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      shatterGlassShard: applyTemperedGlassShardGlintShader(
        new THREE.MeshPhysicalMaterial({
          color: "#cde6f8",
          emissive: "#000000",
          emissiveIntensity: 0.0,
          roughness: 0.035,
          metalness: 0.14,
          transparent: true,
          opacity: 0.38,
          clearcoat: 1.0,
          clearcoatRoughness: 0.02,
          envMapIntensity: 1.65,
          side: THREE.DoubleSide,
        })
      ),
      solarPanelBlue: new THREE.MeshStandardMaterial({
        color: "#ffffff",
        map: pvTex,
        roughness: 0.28,
        metalness: 0.42,
        envMapIntensity: 1.15,
      }),
      tpuHaloGlow: new THREE.MeshBasicMaterial({
        color: "#fde68a",
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      mkBoostPadGlow: new THREE.MeshBasicMaterial({
        color: "#fbbf24",
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
      }),
    },
  };
}
