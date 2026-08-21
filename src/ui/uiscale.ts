// ===== Web 正统 UI 缩放: DOM 流式 rem 布局 =====
// 根字号 (html font-size) 随视口等比变化, 所有 UI 尺寸/间距用 rem 定义 ->
// 窗口变化时浏览器重新排版, UI 等比缩放且字清晰不糊 (Web 生态 / Phaser 社区推荐做法)。
// 基准: 1280x720 时 1rem = 16px。auto 档 k = min(视口宽/1280, 视口高/720)。
// 固定档: 小/普通/大 = 0.75/1/1.5 倍系数。

export type UIScaleMode = "small" | "normal" | "large" | "auto";

const BASE_W = 1280;
const BASE_H = 720;
const FONT_MIN = 8; // px, 极限小窗口也不低于可读下限
const FONT_MAX = 42; // px, 大窗口 + large 档的上限
const MODE_FACTOR: Record<Exclude<UIScaleMode, "auto">, number> = {
  small: 0.75,
  normal: 1,
  large: 1.5,
};

let mode: UIScaleMode = "auto";
const listeners = new Set<() => void>();

/** UI 挂载根: 所有组件挂这里 (舞台内 fixed 元素相对视口定位, 尺寸由 rem 决定, 无需 transform) */
export const uiStage = document.createElement("div");
uiStage.style.cssText = "position:fixed;inset:0;overflow:hidden;z-index:1;";
document.body.appendChild(uiStage);

/** 当前生效倍率 (auto 跟随窗口实时变化) */
function compute(): number {
  const fit = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
  const factor = mode === "auto" ? 1 : MODE_FACTOR[mode];
  return Math.max(FONT_MIN / 16, Math.min(factor * fit, FONT_MAX / 16));
}

/** 按当前模式 + 窗口尺寸更新根字号 (1rem = 16px * 倍率) */
export function applyUIScale(): void {
  document.documentElement.style.fontSize = `${compute() * 16}px`;
}

/** 当前生效倍率 (设置面板显示用) */
export function getCurrentScale(): number {
  return compute();
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

// 窗口缩放合并: 持续缩放时 resize 事件高频触发, 合并到 rAF (每帧最多一次)
const resizeCbs = new Set<() => void>();
let resizeScheduled = false;
window.addEventListener("resize", () => {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(() => {
    resizeScheduled = false;
    resizeCbs.forEach((cb) => cb());
  });
});

/** 注册窗口缩放处理 (合并到 rAF, 高频 resize 每帧最多执行一次) */
export function onResizeMerged(cb: () => void): void {
  resizeCbs.add(cb);
}

// 窗口缩放时实时更新根字号
onResizeMerged(() => applyUIScale());