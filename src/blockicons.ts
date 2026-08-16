// ===== MC 式 3D 物品图标: WebGPU 渲染方块模型进渲染目标, 读回像素编码 PNG 缓存 =====
// 与主渲染器同为 three/webgpu 构建; 光照模拟 MC ITEMS_3D (环境光 + 前上方向光)
import * as THREE from "three/webgpu";
import grassTopUrl from "./assets/textures/block/grass_block_top.png";
import grassSideUrl from "./assets/textures/block/grass_block_side.png";
import dirtUrl from "./assets/textures/block/dirt.png";
import type { BlockType } from "./blocks";

const SIZE = 128;
const HALF_VIEW = 0.85;

let renderer: THREE.WebGPURenderer | null = null;
let rendererReady: Promise<THREE.WebGPURenderer> | null = null;
const cache = new Map<BlockType, string>();
const pending = new Map<BlockType, Promise<string | null>>();

function getRenderer(): Promise<THREE.WebGPURenderer> {
  if (!rendererReady) {
    rendererReady = (async (): Promise<THREE.WebGPURenderer> => {
      const r = new THREE.WebGPURenderer({ antialias: true });
      await r.init();
      r.setClearColor(0x000000, 0);
      renderer = r;
      return r;
    })();
  }
  return rendererReady;
}

function loadTex(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const t = new THREE.TextureLoader().load(url, () => resolve(t), undefined, reject);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
  });
}

async function buildScene(type: BlockType): Promise<THREE.Scene> {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(1, 1.5, 0.75);
  scene.add(dir);
  if (type === "grass") {
    // BoxGeometry 6 组 = +X -X +Y -Y +Z -Z, 与 blocks.ts 的 GRASS_SIDE/TOP/DIRT 一致
    const side = new THREE.MeshLambertMaterial({ map: await loadTex(grassSideUrl), color: 0xffffff });
    const top = new THREE.MeshLambertMaterial({ map: await loadTex(grassTopUrl), color: 0xffffff });
    const dirt = new THREE.MeshLambertMaterial({ map: await loadTex(dirtUrl), color: 0xffffff });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [side, side, top, dirt, side, side]));
  } else {
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x4caf50 })));
  }
  return scene;
}

/** 取方块 3D 图标 (dataURL), 首次调用异步渲染后缓存; 失败返回 null (调用方保持纯色兜底) */
export function getBlockIcon(type: BlockType): Promise<string | null> {
  const cached = cache.get(type);
  if (cached !== undefined) return Promise.resolve(cached);
  const p = pending.get(type);
  if (p) return p;
  const promise = (async (): Promise<string | null> => {
    try {
      const scene = await buildScene(type);
      const r = await getRenderer();
      const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4, depthBuffer: true });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      const cam = new THREE.OrthographicCamera(-HALF_VIEW, HALF_VIEW, HALF_VIEW, -HALF_VIEW, 0.1, 10);
      cam.position.copy(new THREE.Vector3(1, 0.9, 1).normalize().multiplyScalar(3));
      cam.lookAt(0, 0, 0);
      r.setRenderTarget(rt);
      r.render(scene, cam);
      r.setRenderTarget(null);
      const pixels = await r.readRenderTargetPixelsAsync(rt, 0, 0, SIZE, SIZE);
      rt.dispose();
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const clamped = new Uint8ClampedArray(SIZE * SIZE * 4);
      clamped.set(pixels);
      ctx.putImageData(new ImageData(clamped, SIZE, SIZE), 0, 0);
      const url = canvas.toDataURL("image/png");
      cache.set(type, url);
      return url;
    } catch {
      return null;
    }
  })();
  pending.set(type, promise);
  promise.finally(() => pending.delete(type));
  return promise;
}