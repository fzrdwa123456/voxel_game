// ===== 破坏 / 放置 (准星指向), 按键来自 keybinds 绑定表 (默认左键破坏/右键放置) =====
// 双通道触发: 鼠标码走 mousedown, 键盘码走 keydown —— 绑定表统一存码, 两端各自匹配互不干扰
import * as THREE from "three/webgpu";
import type { FirstPersonCamera } from "./camera";
import type { BlockWorld } from "./blocks";
import type { Inventory } from "./ui/inventory";
import { getBind, codeToButton } from "./keybinds";

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

  const canAct = (): boolean => fps.locked && fps.mode !== "spectator";

  // 准星射线取第一个方块命中, 无命中返回 null
  const pick = (): THREE.Intersection | null => {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObjects(world.meshes());
    return hits.length > 0 ? hits[0] : null;
  };

  const tryBreak = (): void => {
    if (!canAct()) return;
    const hit = pick();
    if (!hit) return;
    const p = hit.object.position;
    const px = Math.floor(p.x - 0.5);
    const py = Math.floor(p.y - 0.5);
    const pz = Math.floor(p.z - 0.5);
    world.remove(px, py, pz);
    sendLog(
      `BLOCK 破坏 ${px},${py},${pz} xyz=${fps.position.x.toFixed(2)}/${fps.position.y.toFixed(2)}/${fps.position.z.toFixed(2)}`,
    );
  };

  const tryPlace = (): void => {
    if (!canAct()) return;
    const hit = pick();
    if (!hit) return;
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
  };

  // 通道1: 鼠标 (绑定码为 MouseLeft/MouseMiddle/MouseRight 时生效)
  document.addEventListener("mousedown", (ev) => {
    if (codeToButton(getBind("break")) === ev.button) {
      tryBreak();
    } else if (codeToButton(getBind("place")) === ev.button) {
      tryPlace();
    }
  });

  // 通道2: 键盘 (绑定码为 KeyboardEvent.code 时生效; repeat 守卫按住不连发)
  document.addEventListener("keydown", (ev) => {
    if (ev.repeat) return;
    if (getBind("break") === ev.code) {
      tryBreak();
    } else if (getBind("place") === ev.code) {
      tryPlace();
    }
  });

  document.addEventListener("contextmenu", (ev) => ev.preventDefault());
}
