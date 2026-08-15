// ===== NW.js 渲染层 Node 直连 (替代旧 Electron 的 preload.cjs + main.cjs, 无需 IPC) =====
// NW.js 渲染层自带 Node: 直接 fs/execFile, 日志与光标居中不再走主进程。
// 用 eval("require") 拿 Node require: 避免 vite/rolldown 把 node: 模块 externalize
// 成空对象(浏览器兼容处理), 那会导致 fs 为 undefined 运行时崩溃。NW.js 无 CSP, eval 可用。
const req = eval("require") as (id: string) => any;
const fs = req("node:fs");
const path = req("node:path");
const { execFile } = req("node:child_process");

// game\ 根目录: process.execPath = game\core\core.exe -> 上级即 game\
const gameRoot = path.join(path.dirname(process.execPath), "..");
const logsDir = path.join(gameRoot, "logs");
const coreDir = path.dirname(process.execPath);

function ensureDirs(): void {
  for (const d of ["logs", "saves", "config", "assets"]) {
    fs.mkdirSync(path.join(gameRoot, d), { recursive: true });
  }
}

// 启动初始化: 建目录 + 清空日志 + 挂错误落盘 (对应旧 main.cjs 的日志功能)
export function initShell(): void {
  ensureDirs();
  trackWindowFocus();
  fs.writeFileSync(path.join(logsDir, "debug.log"), "", "utf8");
  fs.writeFileSync(path.join(logsDir, "renderer.log"), "", "utf8");

  window.addEventListener("error", (e) => {
    appendLog(`ERROR ${e.message} @ ${e.filename}:${e.lineno}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    appendLog(`REJECT ${String(e.reason)}`);
  });

  // console error/warning 级写 logs\renderer.log (对应旧 main.cjs console-message)
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...a) => {
    appendRender(`[${new Date().toISOString()}] ${a.map(String).join(" ")}`);
    origError(...a);
  };
  console.warn = (...a) => {
    appendRender(`[${new Date().toISOString()}] ${a.map(String).join(" ")}`);
    origWarn(...a);
  };
}

// 调试日志 -> game\logs\debug.log (启动已清空), 失败静默 (不打断游戏)
export function appendLog(line: string): void {
  try {
    fs.appendFileSync(path.join(logsDir, "debug.log"), `${line}\n`, "utf8");
  } catch {}
}

// 带相对启动时刻时间戳的调试日志 (各模块共用)
export function sendLog(line: string): void {
  appendLog(`[${performance.now().toFixed(0)}ms] ${line}`);
}

function appendRender(line: string): void {
  try {
    fs.appendFileSync(path.join(logsDir, "renderer.log"), `${line}\n`, "utf8");
  } catch {}
}

// 光标居中到屏幕中心: nw.Window 坐标 -> cursor.exe (SetCursorPos)。
// 菜单/背包打开时光标落在准星位置 (旧 Electron 主进程 setCursorPos 的等价物)
export function centerCursor(): void {
  try {
    const win = nw.Window.get();
    const cx = String(Math.round(win.x + win.width / 2));
    const cy = String(Math.round(win.y + win.height / 2));
    execFile(path.join(coreDir, "cursor.exe"), [cx, cy], () => {});
  } catch {}
}

// 显示窗口: manifest "show": false -> 首帧渲染后调用 (对应旧 Electron ready-to-show, 防启动闪白)。
// 窗口默认不获取焦点 (NW.js 特性), show 后显式 focus 对齐原生/DOM 焦点状态
export function showWindow(): void {
  try {
    const win = nw.Window.get();
    win.show();
    win.focus();
  } catch {}
}

// ===== 原生窗口焦点 (NW.js 官方 API: win.on('focus'/'blur') 事件, 无 isFocused 属性) =====
// 官方 Window 参考文档没有 isFocused 属性, 只有 focus/blur 事件与 focus()/blur() 方法。
// 这里用事件维护一个窗口焦点布尔, 供诊断/门控使用。

let windowFocused = false;

// 初始化焦点追踪 (initShell 调用): 注册原生 focus/blur 事件
export function trackWindowFocus(): void {
  try {
    const win = nw.Window.get();
    win.on("focus", () => {
      windowFocused = true;
    });
    win.on("blur", () => {
      windowFocused = false;
    });
    // showWindow 已调用 win.focus(), 乐观初始为聚焦; 后续 blur 事件会纠正
    windowFocused = true;
  } catch {}
}

export function winFocused(): boolean {
  return windowFocused;
}

export function focusWindow(): void {
  try {
    nw.Window.get().focus();
  } catch {}
}

// 退出游戏: 关闭窗口 (唯一窗口关闭后应用退出)
export function quitApp(): void {
  try {
    nw.Window.get().close();
  } catch {}
}

export function onWinFocus(cb: () => void): void {
  try {
    nw.Window.get().on("focus", cb);
  } catch {}
}

export function onWinBlur(cb: () => void): void {
  try {
    nw.Window.get().on("blur", cb);
  } catch {}
}

// ===== GPU 垂直同步开关 (--disable-gpu-vsync) =====
// 直接改写自身 manifest (game\core\package.json) 的 chromium-args, 重启游戏生效
const manifestPath = path.join(coreDir, "package.json");

// 当前是否关闭了垂直同步 (manifest 含 --disable-gpu-vsync)
export function getGpuVsyncState(): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return String(pkg["chromium-args"] ?? "").includes("--disable-gpu-vsync");
  } catch {
    return false;
  }
}

// 写入开关状态: on=true 加旗标(关闭垂直同步), false 移除; 返回是否成功
export function setGpuVsyncState(on: boolean): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const args = String(pkg["chromium-args"] ?? "")
      .split(/\s+/)
      .filter((s) => s.length > 0 && s !== "--disable-gpu-vsync");
    if (on) args.push("--disable-gpu-vsync");
    pkg["chromium-args"] = args.join(" ");
    fs.writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}