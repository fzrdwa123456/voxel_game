import * as THREE from "three/webgpu";
import { FirstPersonCamera, EYE_HEIGHT } from "./camera";
import { BlockWorld } from "./blocks";
import { Inventory } from "./inventory";
import { Menu } from "./menu";
import { MainMenu } from "./mainmenu";
import { Hud } from "./hud";
import { GamemodeController } from "./gamemode";
import { initBlockEdit } from "./blockedit";
import { PointerLock } from "./pointerlock";
import { initShell, sendLog, centerCursor, showWindow, getGpuVsyncState, setGpuVsyncState, winFocused, quitApp, onWinFocus, onWinBlur } from "./shell";

initShell();

const app = document.getElementById("app")!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(1, 2.6, 1);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGPURenderer({
  antialias: true,
  powerPreference: "high-performance",
  trackTimestamp: true,
});
await renderer.init();
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);
// manifest "show": false -> 首帧渲染完成才显示窗口 (防启动闪白)
showWindow();

const fps = new FirstPersonCamera(camera, renderer.domElement);

const world = new BlockWorld(scene);
for (let x = -1; x <= 1; x++) {
  for (let z = -1; z <= 1; z++) {
    world.set(x, 0, z, "grass");
  }
}
fps.setWorld(world);

const hud = new Hud();

// 鼠标锁定管理: 背包/菜单回调都引用, 用 let 声明后赋值, 避免环形依赖
let pointerLock: PointerLock;

// 背包/物品栏 (E 键开关, 打开时暂停游戏并解锁鼠标)
const inv = new Inventory((open) => {
  if (open) {
    fps.prepareUnlock();
    document.exitPointerLock();
    centerCursor();
    stopLoop();
  } else {
    // 下一轮事件循环再重锁: 避开当前 keydown 事件分发后的 Chromium"ESC 退出锁定"默认动作,
    // 否则背包按 ESC 关闭瞬间的同步锁定会被默认动作立即解锁, 并误触发弹菜单
    setTimeout(() => pointerLock.relock(), 0);
    startLoop();
  }
  pointerLock.applyCursor();
});
document.addEventListener("keydown", (ev) => {
  if (ev.code === "KeyE" && !menu.visible && !menu.settingsVisible && !mainMenu.visible) inv.toggle();
});

pointerLock = new PointerLock({
  fps,
  isMenuOpen: () => menu.visible || menu.settingsVisible || mainMenu.visible,
  isInvOpen: () => inv.open,
  sendLog,
});

// 设置回调 (暂停菜单/主菜单共用)
const onFpsCap = (cap: number): void => {
  fpsCap = cap;
  sendLog(`FPS上限 已设为 ${cap === 0 ? "不限制" : cap}`);
};
const onToggleGpuVsync = (on: boolean): boolean => {
  const ok = setGpuVsyncState(on);
  hud.showToast(
    ok
      ? on
        ? "已关闭垂直同步，重启游戏生效"
        : "已开启垂直同步，重启游戏生效"
      : "保存失败，请检查写入权限",
  );
  sendLog(`GPU垂直同步 ${on ? "关闭" : "开启"} ${ok ? "已写入 manifest, 重启生效" : "写入失败"}`);
  return ok;
};

const menu = new Menu(
  () => {
    // 回到游戏: 重新锁定鼠标 (ESC 后有冷却, 失败自动重试)
    pointerLock.relock();
    pointerLock.applyCursor();
    sendLog("RESUME 回到游戏 -> 重锁");
  },
  onFpsCap,
  onToggleGpuVsync,
  () => getGpuVsyncState(),
  () => fpsCap,
);

// 主界面: 单人模式进入游戏; 多人模式占位; 设置/退出
const mainMenu = new MainMenu({
  onStartSingle: () => {
    mainMenu.hide();
    pointerLock.applyCursor();
    pointerLock.relock();
    startLoop();
    sendLog("MAINMENU 进入单人模式");
  },
  onMultiplayer: () => {
    hud.showToast("多人模式尚未实现（占位）");
    sendLog("MAINMENU 多人模式（占位）");
  },
  onExit: () => {
    sendLog("MAINMENU 退出游戏");
    quitApp();
  },
  getFpsCap: () => fpsCap,
  onFpsCap,
  getGpuVsyncState,
  onToggleGpuVsync,
});

// 窗口离开前台 (最小化/切走/点击其他窗口): 立即弹暂停菜单 (仅真在游玩时)。
// 重新聚焦: 游玩中且无任何界面则自动重锁 (MC 行为: 菜单开着不自动关, 需手动继续)。
onWinBlur(() => {
  fps.prepareUnlock();
  if (document.pointerLockElement) document.exitPointerLock();
  if (started && !mainMenu.visible && !menu.visible && !menu.settingsVisible && !inv.open) {
    menu.show();
    pointerLock.applyCursor();
    sendLog("BLUR 失焦 -> 弹暂停菜单");
  }
});
onWinFocus(() => {
  if (started && !mainMenu.visible && !menu.visible && !menu.settingsVisible && !inv.open && !fps.locked) {
    pointerLock.relock();
    sendLog("FOCUS 聚焦 -> 重锁");
  }
});

// ESC: NW.js 0.112 (#7907) 官方已实现 —— ESC 事件正常到达渲染层,
// keydown 里 preventDefault() 可保持 pointer lock, 且 1.25s 重锁冷却已移除。
// (旧 Electron 版需 launcher 钩子吞键 + stdin 管道 + IPC 的"接口后门", 此处已废弃)
document.addEventListener("keydown", (ev) => {
  if (ev.code !== "Escape") return;
  ev.preventDefault(); // #7907: 拦截默认退出锁定, 由我们控制弹菜单/关菜单
  if (mainMenu.visible) {
    // 主界面: ESC 只在设置面板里返回主菜单, 其余忽略
    if (mainMenu.settingsVisible) mainMenu.goBack();
    return;
  }
  if (inv.open) {
    inv.close();
  } else if (menu.settingsVisible) {
    menu.goBack();
  } else if (menu.visible) {
    menu.hide();
    pointerLock.relock(); // 无冷却, 立即重锁
  } else {
    // 游戏内: 直接弹菜单 + 释放鼠标 (光标未捕获也能暂停)
    fps.prepareUnlock();
    document.exitPointerLock();
    menu.show();
    centerCursor();
  }
  pointerLock.applyCursor();
});

// F3+F4 游戏模式切换 + F3 调试面板 (构造时自注册键盘监听)
new GamemodeController(hud, fps, sendLog);

// 左键破坏 / 右键放置
initBlockEdit({ fps, world, camera, inv, sendLog });

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(5, 10, 7);
scene.add(dir);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const timer = new THREE.Timer();
timer.connect(document); // Page Visibility API: 最小化/后台时 delta=0, 恢复自动重置

// 渲染循环: 恒定 requestAnimationFrame (60Hz 显示器最优, 帧送达稳定平滑)
let rafId = 0;
let timerId: ReturnType<typeof setTimeout> | undefined;
let started = false;
// 固定步长物理: 步长与时间累加器 (与帧时序解耦, MC 式固定 tps)
const PHYS_DT = 1 / 120;
let physAcc = 0;
// GPU 渲染耗时测量 (trackTimestamp + resolveTimestampsAsync): EMA 平滑, 换算理论最高帧率
let gpuRenderMs = 0;
let gpuSamples = 0;
// FPS 上限 (0=不限制): 物理仍按固定步长推进, 只门控渲染与统计
let fpsCap = 0;
let renderAcc = 0;
// FPS 统计 (每 0.5s 更新一次)
let fpsAccum = 0;
let fpsFrames = 0;
let fpsTimer = 0;
// 日志转发: 各调试队列按序号增量转发到 debug.log
let lastSpaceSeq = 0;
let lastWallSeq = 0;
let lastEmbedSeq = 0;
let lastWallhSeq = 0;
let lastBurstCount = 0;
let lastMouseSeq = 0;
let lastTransitionSeq = 0;

function renderFrame(): void {
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.1);

  // 固定步长推进物理: 移动量与帧时长无关, 每步恒定 (消除帧时序不均导致的移动抖动)
  physAcc += delta;
  let steps = 0;
  while (physAcc >= PHYS_DT && steps < 12) {
    fps.stepPhysics(PHYS_DT);
    physAcc -= PHYS_DT;
    steps++;
  }
  // 渲染插值: 相机位置在上一物理态与当前物理态间插值, 帧到达不均也平滑
  fps.syncCamera(Math.min(physAcc / PHYS_DT, 1));

  // FPS 上限门控: 未到帧率预算则跳过渲染与统计 (物理已在上方按固定步长推进)
  if (fpsCap > 0) {
    const budget = 1 / fpsCap;
    renderAcc += delta;
    if (renderAcc < budget) return;
    renderAcc %= budget;
  }

  fpsTimer += delta;
  fpsFrames++;
  if (fpsTimer >= 0.5) {
    fpsAccum = fpsFrames / fpsTimer;
    fpsFrames = 0;
    fpsTimer = 0;

    const p = fps.position;
    const feet = p.y - EYE_HEIGHT;
    const top = fps.groundTop();
    sendLog(
      `PHYS 模式=${fps.mode} 地面=${fps.onGround} vy=${fps.vy.toFixed(2)} ` +
        `feet=${feet.toFixed(4)} 顶=${Number.isFinite(top) ? top.toFixed(4) : "无"} ` +
        `差=${Number.isFinite(top) ? (feet - top).toFixed(4) : "-"} ` +
        `差e=${Number.isFinite(top) ? (feet - top).toExponential(2) : "-"} ` +
        `xyz=${p.x.toFixed(2)}/${p.y.toFixed(2)}/${p.z.toFixed(2)}`,
    );

    // 转发新产生的空格事件日志 (SPACE#序号 递增)
    for (const line of fps.spaceLog) {
      const m = /^SPACE#(\d+)/.exec(line);
      if (m && Number(m[1]) > lastSpaceSeq) {
        sendLog(line);
        lastSpaceSeq = Number(m[1]);
      }
    }

    // 转发新产生的水平碰撞被挡日志 (WALL#序号 递增)
    for (const line of fps.wallLog) {
      const m = /^WALL#(\d+)/.exec(line);
      if (m && Number(m[1]) > lastWallSeq) {
        sendLog(line);
        lastWallSeq = Number(m[1]);
      }
    }

    // 转发新产生的垂直顶起日志 (EMBED#序号 递增)
    for (const line of fps.embedLog) {
      const m = /^EMBED#(\d+)/.exec(line);
      if (m && Number(m[1]) > lastEmbedSeq) {
        sendLog(line);
        lastEmbedSeq = Number(m[1]);
      }
    }

    // 转发新产生的水平碰撞被挡日志 (WALLH#序号 递增, 每次 clamp 都记录)
    for (const line of fps.wallhLog) {
      const m = /^WALLH#(\d+)/.exec(line);
      if (m && Number(m[1]) > lastWallhSeq) {
        sendLog(line);
        lastWallhSeq = Number(m[1]);
      }
    }

    // 转发逐帧振荡诊断轨迹 (burstLog 按序追加, 用已转发条数增量转发)
    const bl = fps.burstLog;
    if (lastBurstCount > bl.length) lastBurstCount = 0;
    if (bl.length > lastBurstCount) {
      for (let i = lastBurstCount; i < bl.length; i++) sendLog(bl[i]);
      lastBurstCount = bl.length;
    }

    // 转发鼠标移动事件日志 (MOUSE#序号 递增, 限频 100ms)
    for (const line of fps.mouseLog) {
      const m = /^MOUSE#(\d+)/.exec(line);
      if (m && Number(m[1]) > lastMouseSeq) {
        sendLog(line);
        lastMouseSeq = Number(m[1]);
      }
    }

    // 转发指针锁定切换诊断日志 (LOCK#序号 递增: 切换基准 + 切换后原始位移)
    for (const line of fps.transitionLog) {
      const m = /^LOCK#(\d+)/.exec(line);
      if (m && Number(m[1]) > lastTransitionSeq) {
        sendLog(line);
        lastTransitionSeq = Number(m[1]);
      }
    }

    // 读取 GPU 真实渲染耗时 (ms, 最近一帧总渲染 pass 时间), EMA 平滑; 设备不支持 timestamp-query 时返回 0
    renderer
      .resolveTimestampsAsync("render")
      .then((ms) => {
        if (typeof ms === "number" && ms > 0) {
          gpuSamples++;
          gpuRenderMs = gpuSamples === 1 ? ms : gpuRenderMs * 0.7 + ms * 0.3;
        }
      })
      .catch(() => {});

    // F3 调试面板 (Hud 内部按需显示)
    hud.updateDebug({
      fps: fpsAccum,
      fpsCap,
      x: p.x,
      y: p.y,
      z: p.z,
      blocks: world.meshes().length,
      gpuMs: gpuSamples > 0 ? gpuRenderMs : null,
      mode: fps.mode,
      onGround: fps.onGround,
      vy: fps.vy,
      feet,
      top: Number.isFinite(top) ? top : null,
      logs: [
        { label: "鼠标", lines: fps.mouseLog },
        { label: "空格事件", lines: fps.spaceLog },
        { label: "被挡事件", lines: fps.wallLog },
        { label: "顶起事件", lines: fps.embedLog },
        { label: "水平被挡", lines: fps.wallhLog },
      ],
    });
  }

  renderer.render(scene, camera);
}

function stopLoop(): void {
  cancelAnimationFrame(rafId);
  if (timerId !== undefined) clearInterval(timerId);
  timerId = undefined;
}

function startLoop(): void {
  started = true;
  stopLoop();
  rafId = requestAnimationFrame(function tick() {
    renderFrame();
    rafId = requestAnimationFrame(tick);
  });
}

sendLog(`BOOT 渲染=rAF(60Hz) world=${world.meshes().length} 方块 winFocused=${winFocused()}`);

// 主界面: 先渲染一帧让世界显示在菜单背景后, 再显示主菜单。
// 不启动循环/不锁鼠标, 点击"单人模式"才进入游戏。
renderer.render(scene, camera);
mainMenu.show();
pointerLock.applyCursor();