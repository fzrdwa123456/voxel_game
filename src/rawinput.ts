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

export function startRawInput(): RawInputHandle {
  try {
    // process.execPath = game\core\core.exe -> 同目录下的 rawinput.node
    const coreDir = nodePath.dirname(process.execPath);
    const mod = req(nodePath.join(coreDir, "rawinput.node"));
    nativeListener = new mod.RawMouseListener();
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
