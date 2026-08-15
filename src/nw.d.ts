// NW.js 渲染层全局 (DOM 上下文直接可用, 无需 import)
interface NWWindow {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  show(): void;
  focus(): void;
  close(): void;
  on(event: "focus" | "blur", callback: () => void): void;
}
declare const nw: {
  Window: { get(): NWWindow };
};

// Node 全局 (NW.js 渲染层默认开启)
declare const process: {
  versions: Record<string, string>;
  execPath: string;
};
declare const require: (id: string) => any;