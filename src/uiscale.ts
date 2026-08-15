// ===== MC 式界面缩放: 小/普通/大/自动, 自动按窗口相对基准(1280x720)等比例缩放 =====
// 任意档位生效值 = min(请求档, fitMax): fitMax 保证最大面板不超出窗口 (MC 同款"分辨率不匹配则无法变大")。
// 自动档下限 1.0: UI 永不缩到比设计基准小。各 UI 组件用 registerUIScalable 注册自己的缩放函数。

export type UIScaleMode = "small" | "normal" | "large" | "auto";

const BASE_W = 1280;
const BASE_H = 720;
const AUTO_MIN = 1;
const AUTO_MAX = 1.75;
const MODE_SCALE: Record<Exclude<UIScaleMode, "auto">, number> = {
  small: 0.75,
  normal: 1,
  large: 1.5,
};

// 适配钳制参考: 最大面板约 300x360 (主菜单), 留 30px 边距; 下限 1 保证 UI 不缩小
const PANEL_W = 300;
const PANEL_H = 360;
const MARGIN = 30;

let mode: UIScaleMode = "auto";
const appliers = new Set<(scale: number) => void>();
const listeners = new Set<() => void>();

/** 当前窗口能容纳的最大缩放比 (按最大面板 + 边距) */
function fitMax(): number {
  const fx = (window.innerWidth - MARGIN) / PANEL_W;
  const fy = (window.innerHeight - MARGIN) / PANEL_H;
  return Math.max(1, Math.min(fx, fy));
}

function compute(): number {
  const fit = fitMax();
  if (mode === "auto") {
    const s = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
    return Math.min(Math.max(AUTO_MIN, Math.min(AUTO_MAX, s)), fit);
  }
  return Math.min(MODE_SCALE[mode], fit);
}

/** 用当前模式 + 窗口尺寸算出的缩放比, 应用给所有已注册 UI */
export function applyUIScale(): void {
  const s = compute();
  appliers.forEach((a) => a(s));
}

/** 组件注册自己的缩放函数 (内部应同时设 transform 与 transformOrigin) */
export function registerUIScalable(applier: (scale: number) => void): void {
  appliers.add(applier);
  applier(compute());
}

export function getUIScaleMode(): UIScaleMode {
  return mode;
}

export function setUIScaleMode(m: UIScaleMode): void {
  if (m === mode) return;
  mode = m;
  applyUIScale();
  listeners.forEach((cb) => cb());
}

export function onUIScaleModeChange(cb: () => void): void {
  listeners.add(cb);
}

/** 启动时从配置载入缩放模式 (无效值回退自动) */
export function loadUIScaleMode(v: unknown): void {
  if (v === "small" || v === "normal" || v === "large" || v === "auto") mode = v;
}

// 窗口缩放时实时重算 (手动档也依赖 fitMax, 因此不限 auto)
window.addEventListener("resize", () => applyUIScale());