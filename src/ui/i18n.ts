// ===== 多语言: 中/英 字典 + t() + 运行时切换 (切换时通知各 UI 刷新) =====
// 只覆盖用户可见 UI 文案; debug.log 里的诊断行 (SPACE#/WALL#/BLOCK 等) 保持中文。

export type Lang = "zh" | "en";

type Dict = Record<string, string>;

const zh: Dict = {
  "menu.paused": "暂停",
  "menu.resume": "回到游戏",
  "menu.settings": "设置",
  "menu.toMainMenu": "回到主菜单",
  "menu.back": "返回",
  "settings.fpsCap": "帧率上限",
  "settings.unlimited": "无限",
  "settings.vsyncOff": "垂直同步: 已关闭(重启生效)",
  "settings.vsyncOn": "垂直同步: 已开启(重启生效)",
  "settings.language": "语言",
  "settings.languageFont": "语言与字体",
  "settings.font": "字体",
  "fonts.pixel": "Fusion Pixel",
  "fonts.system": "系统字体",
  "lang.zh": "简体中文",
  "lang.en": "English",
  "settings.resourcepacks": "资源包",
  "settings.packsBuiltin": "内置",
  "settings.packsEmpty": "未找到资源包",
  "settings.uiScale": "界面缩放",
  "uiScale.small": "小",
  "uiScale.normal": "普通",
  "uiScale.large": "大",
  "uiScale.auto": "自动",
  "settings.windowMode": "窗口模式",
  "windowMode.windowed": "窗口化",
  "windowMode.fullscreen": "全屏",
  "settings.keybinds": "按键绑定",
  "settings.bindOptions": "绑定选项",
  "bind.forward": "前进",
  "bind.back": "后退",
  "bind.left": "左移",
  "bind.right": "右移",
  "bind.jump": "跳跃",
  "bind.sneak": "潜行",
  "bind.inventory": "背包",
  "bind.break": "破坏",
  "bind.place": "放置",
  "bind.pressAny": "按任意键…",
  "bind.unbound": "未绑定",
  "bind.hint": "点互动按钮选中 → 点键盘按键完成绑定 · Esc 解绑该动作",
  "main.single": "单人模式",
  "main.multi": "多人模式",
  "main.quit": "退出游戏",
  "inv.title": "背包 (点击格子放入选中物品栏槽)",
  "gamemode.title": "游戏模式",
  "mode.walk": "生存模式",
  "mode.fly": "创造模式",
  "mode.spectator": "观察者模式",
  "toast.vsyncOff": "已关闭垂直同步，重启游戏生效",
  "toast.vsyncOn": "已开启垂直同步，重启游戏生效",
  "toast.vsyncFail": "保存失败，请检查写入权限",
  "toast.multiPlaceholder": "多人模式尚未实现（占位）",
  "f3.cap": "上限",
  "f3.unlimited": "不限",
  "f3.blocks": "方块",
  "f3.gpuNa": "不可用",
  "f3.maxFps": "最高",
  "f3.phys": "物理",
  "f3.mode": "模式",
  "f3.ground": "地面",
  "f3.top": "顶",
  "f3.diff": "差",
  "f3.diffE": "差e",
  "f3.none": "无",
  "f3.logMouse": "鼠标",
  "f3.logSpace": "空格事件",
  "f3.logWall": "被挡事件",
  "f3.logEmbed": "顶起事件",
  "f3.logWallh": "水平被挡",
  "f3.recent": "最近",
};

const en: Dict = {
  "menu.paused": "Paused",
  "menu.resume": "Back to Game",
  "menu.settings": "Settings",
  "menu.toMainMenu": "Back to Main Menu",
  "menu.back": "Back",
  "settings.fpsCap": "FPS Cap",
  "settings.unlimited": "Unlimited",
  "settings.vsyncOff": "VSync: Disabled (restart to apply)",
  "settings.vsyncOn": "VSync: Enabled (restart to apply)",
  "settings.language": "Language",
  "settings.languageFont": "Language & Font",
  "settings.font": "Font",
  "fonts.pixel": "Fusion Pixel",
  "fonts.system": "System Font",
  "lang.zh": "简体中文",
  "lang.en": "English",
  "settings.resourcepacks": "Resource Packs",
  "settings.packsBuiltin": "Built-in",
  "settings.packsEmpty": "No resource packs found",
  "settings.uiScale": "GUI Scale",
  "uiScale.small": "Small",
  "uiScale.normal": "Normal",
  "uiScale.large": "Large",
  "uiScale.auto": "Auto",
  "settings.windowMode": "Window Mode",
  "windowMode.windowed": "Windowed",
  "windowMode.fullscreen": "Fullscreen",
  "settings.keybinds": "Key Binds",
  "settings.bindOptions": "Bind Options",
  "bind.forward": "Move Forward",
  "bind.back": "Move Back",
  "bind.left": "Move Left",
  "bind.right": "Move Right",
  "bind.jump": "Jump",
  "bind.sneak": "Sneak",
  "bind.inventory": "Inventory",
  "bind.break": "Break",
  "bind.place": "Place",
  "bind.pressAny": "Press any key…",
  "bind.unbound": "Unbound",
  "bind.hint": "Select a button, then click a key · Esc to unbind",
  "main.single": "Singleplayer",
  "main.multi": "Multiplayer",
  "main.quit": "Quit Game",
  "inv.title": "Inventory (click a slot to swap with the selected hotbar slot)",
  "gamemode.title": "Game Mode",
  "mode.walk": "Survival Mode",
  "mode.fly": "Creative Mode",
  "mode.spectator": "Spectator Mode",
  "toast.vsyncOff": "VSync disabled, restart to apply",
  "toast.vsyncOn": "VSync enabled, restart to apply",
  "toast.vsyncFail": "Failed to save, check write permissions",
  "toast.multiPlaceholder": "Multiplayer not implemented yet",
  "f3.cap": "Cap",
  "f3.unlimited": "unlimited",
  "f3.blocks": "Blocks",
  "f3.gpuNa": "N/A",
  "f3.maxFps": "max",
  "f3.phys": "Physics",
  "f3.mode": "mode",
  "f3.ground": "ground",
  "f3.top": "top",
  "f3.diff": "diff",
  "f3.diffE": "diffe",
  "f3.none": "none",
  "f3.logMouse": "Mouse",
  "f3.logSpace": "Space",
  "f3.logWall": "Wall hits",
  "f3.logEmbed": "Embed",
  "f3.logWallh": "H-collisions",
  "f3.recent": "recent",
};

const STRINGS: Record<Lang, Dict> = { zh, en };

let current: Lang = "zh";
const listeners = new Set<() => void>();

/** 取当前语言的文案; 缺词回退中文, 再缺返回 key 本身 */
export function t(key: string): string {
  return STRINGS[current][key] ?? STRINGS.zh[key] ?? key;
}

export function getLang(): Lang {
  return current;
}

/** 切换语言: 立即通知所有已注册的 UI 刷新 (不负责存盘, 存盘由 main.ts 订阅 onLangChange 完成) */
export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  listeners.forEach((cb) => cb());
}

/** 订阅语言变更 (UI 注册 refresh) */
export function onLangChange(cb: () => void): void {
  listeners.add(cb);
}

/** 启动时从配置载入语言 (无效值回退中文) */
export function loadLang(l: unknown): void {
  if (l === "zh" || l === "en") current = l;
}