// ===== 左键破坏 / 右键放置 (准星指向) =====
import * as THREE from "three/webgpu";
import type { FirstPersonCamera } from "./camera";
import type { BlockWorld } from "./blocks";
import type { Inventory } from "./inventory";

export interface BlockEditDeps {
  fps: FirstPersonCamera;
  world: BlockWorld;
  camera: THREE.PerspectiveCamera;
  inv: Inventory;
  sendLog: (line: string) => void;
}

export function initBlockEdit(deps: BlockEditDeps): void {
  const { fps, world, camera, inv, sendLog } = deps;
  const raycaster = new THREE.Raycaster();

  document.addEventListener("mousedown", (ev) => {
    if (!fps.locked || fps.mode === "spectator") return;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObjects(world.meshes());
    if (hits.length === 0) return;
    const hit = hits[0];
    if (ev.button === 0) {
      const p = hit.object.position;
      const px = Math.floor(p.x - 0.5);
      const py = Math.floor(p.y - 0.5);
      const pz = Math.floor(p.z - 0.5);
      world.remove(px, py, pz);
      sendLog(
        `BLOCK 破坏 ${px},${py},${pz} xyz=${fps.position.x.toFixed(2)}/${fps.position.y.toFixed(2)}/${fps.position.z.toFixed(2)}`,
      );
    } else if (ev.button === 2) {
      const type = inv.selectedType();
      if (!type) {
        sendLog("BLOCK 放置被拒 空手(物品栏无选中方块)");
        return;
      }
      const n = hit.face!.normal;
      const px = Math.floor(hit.point.x + n.x * 0.5);
      const py = Math.floor(hit.point.y + n.y * 0.5);
      const pz = Math.floor(hit.point.z + n.z * 0.5);
      if (!world.get(px, py, pz) && !fps.overlaps(px, py, pz)) {
        world.set(px, py, pz, type);
        sendLog(
          `BLOCK 放置 ${px},${py},${pz} 类型=${type} xyz=${fps.position.x.toFixed(2)}/${fps.position.y.toFixed(2)}/${fps.position.z.toFixed(2)}`,
        );
      } else {
        sendLog(
          `BLOCK 放置被拒 ${px},${py},${pz} 已有=${world.get(px, py, pz) !== undefined} 重叠=${fps.overlaps(px, py, pz)}`,
        );
      }
    }
  });
  document.addEventListener("contextmenu", (ev) => ev.preventDefault());
}