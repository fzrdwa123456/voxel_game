// ===== 原始鼠标输入 (Rust 原生插件包装层) =====
// 加载 game\core\rawinput.node (源码在 rawinput/, cargo build --release 产物):
// 后台线程 HWND_MESSAGE 窗口 + RegisterRawInputDevices(INPUTSINK) 收 WM_INPUT,
// 原子累加相对增量, JS 定时 pollDelta() 取走清零。
// 视角旋转的门控在 FirstPersonCamera.applyRawInput 内部:
// 仅在 pointer lock 被 Chromium 取消且窗口半在屏幕外时应用 (自由鼠标模式),
// 锁定态/菜单态直接丢弃, 避免与 movementX 双重计数或菜单后转视角。
import { sendLog } from "./shell";

interface RawMouseNative {
  pollDelta(): { dx: number; dy: number };
  /** 设置系统光标屏幕坐标 (进程内直调, 替代旧 cursor.exe 子进程) */
  setCursorPos?(x: number, y: number): boolean;
}

const req = eval("require") as (id: string) => any;
const nodePath = req("node:path");

export interface RawInputHandle {
  /** 插件是否加载成功 (false = 游戏照常运行, 无原始输入兜底) */
  available: boolean;
  /** 取走累计增量并清零 */
  poll(): { dx: number; dy: number };
}

let nativeListener: RawMouseNative | null = null;
// 模块引用: set_cursor_pos 是模块级导出 (与 RawMouseListener 类并列), 不在实例上
let nativeModule: { setCursorPos?(x: number, y: number): boolean } | null = null;

export function startRawInput(): RawInputHandle {
  try {
    // process.execPath = game\core\core.exe -> 同目录下的 rawinput.node
    const coreDir = nodePath.dirname(process.execPath);
    const mod = req(nodePath.join(coreDir, "rawinput.node"));
    nativeListener = new mod.RawMouseListener();
    nativeModule = mod;
    sendLog("RAWINPUT 插件加载成功, 原始输入监听已启动");
    return {
      available: true,
      poll: () => nativeListener!.pollDelta(),
    };
  } catch (e) {
    sendLog(`RAWINPUT 加载失败 (无原始输入兜底, 不影响游戏): ${String(e)}`);
    return { available: false, poll: () => ({ dx: 0, dy: 0 }) };
  }
}

// 光标居中到窗口中心 (屏幕坐标): 菜单/背包打开时光标落在准星位置。
// 优先走插件进程内直调 (~微秒); 旧 cursor.exe 子进程方案已停用, 源码保留在 launcher/cursor.c
// (重新启用需恢复 npm run build:cursor 并解开下方注释)
export function centerCursor(): void {
  try {
    const win = (globalThis as any).nw.Window.get();
    const cx = Math.round(win.x + win.width / 2);
    const cy = Math.round(win.y + win.height / 2);
    if (nativeModule?.setCursorPos?.(cx, cy)) return;
    // const { execFile } = req("node:child_process");
    // execFile(nodePath.join(coreDir, "cursor.exe"), [String(cx), String(cy)], () => {});
  } catch {}
}
