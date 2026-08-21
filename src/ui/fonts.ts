// ===== 字体切换: CSS 变量 --font-ui / --font-mono, 切换即时生效 (无需重启) =====
// 所有 UI 的 font 简写引用 var(--font-ui) / var(--font-mono), 改这两个变量即全局换字体。

export type FontId = "pixel" | "system";

interface FontDef {
  ui: string;
  mono: string;
}

const FONTS: Record<FontId, FontDef> = {
  pixel: {
    ui: "'Fusion Pixel 12px Proportional SC',sans-serif",
    mono: "'Fusion Pixel 12px Monospaced SC',monospace",
  },
  system: {
    ui: "'Microsoft YaHei','PingFang SC','Noto Sans SC',sans-serif",
    mono: "Consolas,'Microsoft YaHei',monospace",
  },
};

let current: FontId = "pixel";
const listeners = new Set<() => void>();

/** 把当前字体写入 CSS 变量 (UI 全部引用 var(), 即时更新) */
function applyFont(): void {
  const f = FONTS[current];
  document.documentElement.style.setProperty("--font-ui", f.ui);
  document.documentElement.style.setProperty("--font-mono", f.mono);
}

export function getFontId(): FontId {
  return current;
}

export function setFontId(id: FontId): void {
  if (id === current) return;
  current = id;
  applyFont();
  listeners.forEach((cb) => cb());
}

export function onFontChange(cb: () => void): void {
  listeners.add(cb);
}

/** 启动时从配置载入字体 (无效值回退像素字体) */
export function loadFont(v: unknown): void {
  if (v === "pixel" || v === "system") current = v;
  applyFont();
}