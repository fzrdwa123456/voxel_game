import * as THREE from "three/webgpu";
import grassTopUrl from "./assets/textures/block/grass_block_top.png";
import grassSideUrl from "./assets/textures/block/grass_block_side.png";
import dirtUrl from "./assets/textures/block/dirt.png";

export type BlockType = "default" | "grass";

const HALF = 0.5;

// 6 个面的顶点/法线/UV (每面独立 4 顶点, 不共享), 索引 0,1,2 / 0,2,3
// UV 按"观察者站在面外侧看: 图片上=方块上, 左=右"排列
const FACES: { pos: number[][]; n: number[]; uv: number[][] }[] = [
  { pos: [[HALF, -HALF, -HALF], [HALF, HALF, -HALF], [HALF, HALF, HALF], [HALF, -HALF, HALF]], n: [1, 0, 0], uv: [[1, 0], [1, 1], [0, 1], [0, 0]] }, // +X
  { pos: [[-HALF, -HALF, HALF], [-HALF, HALF, HALF], [-HALF, HALF, -HALF], [-HALF, -HALF, -HALF]], n: [-1, 0, 0], uv: [[1, 0], [1, 1], [0, 1], [0, 0]] }, // -X
  { pos: [[-HALF, HALF, -HALF], [-HALF, HALF, HALF], [HALF, HALF, HALF], [HALF, HALF, -HALF]], n: [0, 1, 0], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }, // +Y
  { pos: [[-HALF, -HALF, HALF], [-HALF, -HALF, -HALF], [HALF, -HALF, -HALF], [HALF, -HALF, HALF]], n: [0, -1, 0], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }, // -Y
  { pos: [[-HALF, -HALF, HALF], [HALF, -HALF, HALF], [HALF, HALF, HALF], [-HALF, HALF, HALF]], n: [0, 0, 1], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }, // +Z
  { pos: [[HALF, -HALF, -HALF], [-HALF, -HALF, -HALF], [-HALF, HALF, -HALF], [HALF, HALF, -HALF]], n: [0, 0, -1], uv: [[1, 0], [0, 0], [0, 1], [1, 1]] }, // -Z
];

/** 草方块材质索引: 侧面=0 顶面=1 底面=2 */
const GRASS_SIDE = 0;
const GRASS_TOP = 1;
const GRASS_DIRT = 2;

function buildGeometry(faces: { f: number; m: number }[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const groups: { start: number; count: number; mat: number }[] = [];
  let base = 0;
  let curMat: number | null = null;
  let groupStart = 0;
  for (const { f, m } of faces) {
    if (m !== curMat) {
      if (curMat !== null) groups.push({ start: groupStart, count: idx.length - groupStart, mat: curMat });
      curMat = m;
      groupStart = idx.length;
    }
    const face = FACES[f];
    for (const p of face.pos) pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i++) nor.push(face.n[0], face.n[1], face.n[2]);
    for (const u of face.uv) uv.push(u[0], u[1]);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  if (curMat !== null) groups.push({ start: groupStart, count: idx.length - groupStart, mat: curMat });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  for (const gr of groups) g.addGroup(gr.start, gr.count, gr.mat);
  return g;
}

const NEIGHBORS: number[][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export class BlockWorld {
  private readonly blocks = new Map<string, { mesh: THREE.Mesh; type: BlockType }>();
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly grassMats: THREE.MeshLambertMaterial[];
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.mat = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
    const loader = new THREE.TextureLoader();
    const tex = (url: string): THREE.Texture => {
      const t = loader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      return t;
    };
    this.grassMats = [
      new THREE.MeshLambertMaterial({ map: tex(grassSideUrl), color: 0xffffff }),
      new THREE.MeshLambertMaterial({ map: tex(grassTopUrl), color: 0xffffff }),
      new THREE.MeshLambertMaterial({ map: tex(dirtUrl), color: 0xffffff }),
    ];
  }

  static key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  get(x: number, y: number, z: number): THREE.Mesh | undefined {
    return this.blocks.get(BlockWorld.key(x, y, z))?.mesh;
  }

  getType(x: number, y: number, z: number): BlockType | undefined {
    return this.blocks.get(BlockWorld.key(x, y, z))?.type;
  }

  set(x: number, y: number, z: number, type: BlockType = "default"): void {
    const k = BlockWorld.key(x, y, z);
    if (this.blocks.has(k)) return;
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), type === "grass" ? this.grassMats : this.mat);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.blocks.set(k, { mesh, type });
    this.scene.add(mesh);
    this.refresh(x, y, z);
    for (const [dx, dy, dz] of NEIGHBORS) this.refresh(x + dx, y + dy, z + dz);
  }

  remove(x: number, y: number, z: number): void {
    const k = BlockWorld.key(x, y, z);
    const entry = this.blocks.get(k);
    if (!entry) return;
    this.blocks.delete(k);
    this.scene.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    for (const [dx, dy, dz] of NEIGHBORS) this.refresh(x + dx, y + dy, z + dz);
  }

  private faceMaterial(type: BlockType, f: number): number {
    if (type !== "grass") return 0;
    if (f === 2) return GRASS_TOP;
    if (f === 3) return GRASS_DIRT;
    return GRASS_SIDE;
  }

  /** 隐藏面剔除: 只保留与空气相邻的面 */
  private refresh(x: number, y: number, z: number): void {
    const entry = this.blocks.get(BlockWorld.key(x, y, z));
    if (!entry) return;
    const faces: { f: number; m: number }[] = [];
    const pushFace = (fi: number): void => {
      faces.push({ f: fi, m: this.faceMaterial(entry.type, fi) });
    };
    if (!this.blocks.has(BlockWorld.key(x + 1, y, z))) pushFace(0);
    if (!this.blocks.has(BlockWorld.key(x - 1, y, z))) pushFace(1);
    if (!this.blocks.has(BlockWorld.key(x, y + 1, z))) pushFace(2);
    if (!this.blocks.has(BlockWorld.key(x, y - 1, z))) pushFace(3);
    if (!this.blocks.has(BlockWorld.key(x, y, z + 1))) pushFace(4);
    if (!this.blocks.has(BlockWorld.key(x, y, z - 1))) pushFace(5);
    entry.mesh.geometry.dispose();
    entry.mesh.geometry = buildGeometry(faces);
  }

  meshes(): THREE.Mesh[] {
    return [...this.blocks.values()].map((e) => e.mesh);
  }

  forEach(cb: (x: number, y: number, z: number) => void): void {
    for (const k of this.blocks.keys()) {
      const [x, y, z] = k.split(",").map(Number);
      cb(x, y, z);
    }
  }
}