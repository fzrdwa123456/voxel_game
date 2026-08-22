// ===== 按键绑定注册表 =====
// 动作 id -> KeyboardEvent.code。默认值 + settings.json 持久化 (keybinds 字段)。
// 换绑冲突策略: 抢占 —— 新 code 已被其他动作占用时, 对方清为未绑定 ("")。
// ESC 不允许绑定 (保留给菜单), 由捕获层拦截。

export type BindAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "jump"
  | "sneak"
  | "inventory"
  | "break"
  | "place";

interface BindDef {
  action: BindAction;
  defaultCode: string;
}

const DEFS: BindDef[] = [
  { action: "forward", defaultCode: "KeyW" },
  { action: "back", defaultCode: "KeyS" },
  { action: "left", defaultCode: "KeyA" },
  { action: "right", defaultCode: "KeyD" },
  { action: "jump", defaultCode: "Space" },
  { action: "sneak", defaultCode: "ControlLeft" },
  { action: "inventory", defaultCode: "KeyE" },
  // 鼠标键绑定: 存伪 code (MouseLeft/MouseRight), 与键盘码同一张表统一管理
  { action: "break", defaultCode: "MouseLeft" },
  { action: "place", defaultCode: "MouseRight" },
];

const binds = new Map<BindAction, string>(DEFS.map((d) => [d.action, d.defaultCode]));

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

/** 启动时从 settings.json 的 keybinds 对象载入 (未知动作/非法值忽略, 回退默认) */
export function loadBinds(raw: unknown): void {
  if (typeof raw !== "object" || raw === null) return;
  const obj = raw as Record<string, unknown>;
  for (const d of DEFS) {
    const v = obj[d.action];
    if (typeof v === "string" && (v === "" || isValidCode(v))) {
      binds.set(d.action, v);
    }
  }
}

/** 当前全部绑定快照 (存盘用) */
export function getBindsAll(): Record<BindAction, string> {
  const out = {} as Record<BindAction, string>;
  for (const d of DEFS) out[d.action] = binds.get(d.action)!;
  return out;
}

export function getBind(action: BindAction): string {
  return binds.get(action)!;
}

/** 换绑: 抢占冲突 (其他动作的同 code 清为未绑定), 通知订阅者刷新 UI */
export function setBind(action: BindAction, code: string): void {
  if (code !== "" && !isValidCode(code)) return;
  for (const d of DEFS) {
    if (d.action !== action && binds.get(d.action) === code) {
      binds.set(d.action, "");
    }
  }
  binds.set(action, code);
  notify();
}

export function onBindsChange(cb: () => void): void {
  listeners.add(cb);
}

// ===== 换绑捕获状态 =====
// UI 层点击某行进入捕获; 先于捕获监听器注册的旧监听器 (如背包 E 键)
// 通过 isCapturing() 查询并让路, 避免换绑时误触游戏功能。
let capturing: BindAction | null = null;

export function beginCapture(action: BindAction): void {
  capturing = action;
}

export function endCapture(): void {
  capturing = null;
}

export function isCapturing(): boolean {
  return capturing !== null;
}

export function getCapturing(): BindAction | null {
  return capturing;
}

/** KeyboardEvent.code 合法性: 字母开头的标识符 (KeyW/Space/ControlLeft/ArrowUp/MouseLeft...) */
function isValidCode(code: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(code);
}

/** 绑定码 -> MouseEvent.button 编号 (仅鼠标伪码有映射, 键盘码返回 null) */
export function codeToButton(code: string): number | null {
  if (code === "MouseLeft") return 0;
  if (code === "MouseMiddle") return 1;
  if (code === "MouseRight") return 2;
  if (code === "MouseX1") return 3;
  if (code === "MouseX2") return 4;
  return null;
}

/** MouseEvent.button -> 鼠标伪码 ("MouseLeft"/"MouseMiddle"/"MouseRight"/"MouseX1"/"MouseX2"), 其他按钮 null */
export function buttonToCode(button: number): string | null {
  if (button === 0) return "MouseLeft";
  if (button === 1) return "MouseMiddle";
  if (button === 2) return "MouseRight";
  if (button === 3) return "MouseX1";
  if (button === 4) return "MouseX2";
  return null;
}

/** MouseEvent.button -> 绑定了该鼠标键的动作 (查绑定表), 未绑定返回 null */
export function buttonToAction(button: number): BindAction | null {
  const code = buttonToCode(button);
  if (!code) return null;
  for (const d of DEFS) {
    if (binds.get(d.action) === code) return d.action;
  }
  return null;
}

/** code -> 显示名 (KeyW->W, Digit1->1, ControlLeft->LCtrl, ArrowUp->↑ ...) */
export function codeDisplayName(code: string): string {
  if (code === "") return "";
  const MAP: Record<string, string> = {
    Space: "Space",
    MouseLeft: "LMB",
    MouseMiddle: "MMB",
    MouseRight: "RMB",
    MouseX1: "X1",
    MouseX2: "X2",
    ControlLeft: "LCtrl",
    ControlRight: "RCtrl",
    ShiftLeft: "LShift",
    ShiftRight: "RShift",
    AltLeft: "LAlt",
    AltRight: "RAlt",
    MetaLeft: "Win",
    MetaRight: "Win",
    ContextMenu: "Menu",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Tab: "Tab",
    CapsLock: "Caps",
    Enter: "Enter",
    Backspace: "Bksp",
    Escape: "Esc",
    Insert: "Ins",
    Delete: "Del",
    PageUp: "PgUp",
    PageDown: "PgDn",
    Home: "Home",
    End: "End",
    PrintScreen: "PrtSc",
    ScrollLock: "ScrLk",
    Pause: "Pause",
    NumLock: "Num",
    NumpadDivide: "/",
    NumpadMultiply: "*",
    NumpadSubtract: "-",
    NumpadAdd: "+",
    NumpadEnter: "⏎",
    NumpadDecimal: ".",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Backquote: "`",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
  };
  if (MAP[code]) return MAP[code];
  const m = /^(?:Key|Digit|Numpad)(.+)$/.exec(code);
  if (m) return m[1];
  return code;
}
