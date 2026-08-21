// ===== 暂停菜单 + 共享设置面板 (帧率上限/垂直同步/语言/界面缩放/窗口模式), 主菜单也复用设置面板 =====
import { t, getLang, setLang, onLangChange } from "./i18n";
import { getUIScaleMode, setUIScaleMode, onUIScaleModeChange, onResizeMerged, getCurrentScale, uiStage } from "./uiscale";
import { getFontId, setFontId, onFontChange, type FontId } from "./fonts";
import { listPacks } from "../textures";
import { onWindowModeChange, type WindowMode } from "../shell";

export interface SettingsCallbacks {
  getFpsCap: () => number;
  onFpsCap: (cap: number) => void;
  getGpuVsyncState: () => boolean;
  onToggleGpuVsync: (on: boolean) => boolean;
  getWindowMode: () => WindowMode;
  onSetWindowMode: (mode: WindowMode) => void;
}

// 共享设置面板: 帧率上限滑条 + 垂直同步开关 + 语言合集 + 资源包合集 + 窗口模式 + 界面缩放 + 返回 (暂停菜单/主菜单共用)
// 返回 { settingsPanel, langPanel, packPanel } 三个面板, 调用方挂到同一根容器切换显示
export function buildSettingsPanel(
  opts: SettingsCallbacks & { onBack: () => void },
): { settingsPanel: HTMLDivElement; langPanel: HTMLDivElement; packPanel: HTMLDivElement } {
  const btnStyle =
    "display:block;width:100%;padding:0.625rem;margin:0.375rem 0;font:0.9375rem var(--font-ui);color:#fff;" +
    "background:#444;border:none;border-radius:0.375rem;cursor:pointer;";

  const settingsPanel = document.createElement("div");
  settingsPanel.style.cssText =
    "width:17.5rem;background:#222;border-radius:0.625rem;padding:1.25rem;text-align:center;color:#fff;" +
    "font:1rem var(--font-ui);box-shadow:0 0.25rem 1.25rem rgba(0,0,0,.5);display:none;";

  const sTitle = document.createElement("div");
  sTitle.style.cssText = "font-size:1.375rem;margin-bottom:0.875rem;";
  settingsPanel.appendChild(sTitle);

  const capLabel = document.createElement("div");
  capLabel.style.cssText = "text-align:left;font-size:0.9375rem;margin:0.5rem 0 0.25rem;";
  settingsPanel.appendChild(capLabel);

  const capValue = document.createElement("div");
  capValue.style.cssText =
    "text-align:center;font-size:1.25rem;font-weight:600;color:#fff;margin:0.125rem 0 0.375rem;";
  settingsPanel.appendChild(capValue);

  const CAP_MIN = 30;
  const CAP_MAX = 240; // 拉满 = 无限
  const capSlider = document.createElement("input");
  capSlider.type = "range";
  capSlider.min = String(CAP_MIN);
  capSlider.max = String(CAP_MAX);
  capSlider.step = "2";
  capSlider.value = String(Math.max(CAP_MIN, Math.min(CAP_MAX, opts.getFpsCap() || CAP_MAX)));
  capSlider.style.cssText = "width:100%;margin:0 0 0.625rem;accent-color:#4a9eff;cursor:pointer;";
  const renderCap = (): void => {
    capValue.textContent = Number(capSlider.value) >= CAP_MAX ? t("settings.unlimited") : `${capSlider.value} FPS`;
  };
  capSlider.oninput = () => {
    renderCap();
    opts.onFpsCap(Number(capSlider.value) >= CAP_MAX ? 0 : Number(capSlider.value));
  };
  settingsPanel.appendChild(capSlider);

  let gpuVsyncOn = opts.getGpuVsyncState();
  const gpuBtn = document.createElement("button");
  gpuBtn.style.cssText = btnStyle;
  gpuBtn.onmouseover = () => (gpuBtn.style.background = "#555");
  gpuBtn.onmouseout = () => (gpuBtn.style.background = "#444");
  const renderGpuBtn = (): void => {
    gpuBtn.textContent = gpuVsyncOn ? t("settings.vsyncOff") : t("settings.vsyncOn");
  };
  gpuBtn.onclick = () => {
    const next = !gpuVsyncOn;
    if (opts.onToggleGpuVsync(next)) {
      gpuVsyncOn = next;
      renderGpuBtn();
    }
  };
  settingsPanel.appendChild(gpuBtn);

  // 语言与字体合集: 按钮进入子面板 (左: 语言, 右: 字体)
  const langBtn = document.createElement("button");
  langBtn.style.cssText = btnStyle;
  langBtn.onmouseover = () => (langBtn.style.background = "#555");
  langBtn.onmouseout = () => (langBtn.style.background = "#444");
  langBtn.onclick = () => {
    settingsPanel.style.display = "none";
    langPanel.style.display = "block";
  };
  settingsPanel.appendChild(langBtn);

  // 语言与字体子面板: 左右双栏, 与设置面板同级切换
  const langPanel = document.createElement("div");
  langPanel.style.cssText =
    "width:34rem;background:#222;border-radius:0.625rem;padding:1.25rem;text-align:center;color:#fff;" +
    "font:1rem var(--font-ui);box-shadow:0 0.25rem 1.25rem rgba(0,0,0,.5);display:none;";

  const langTitle = document.createElement("div");
  langTitle.style.cssText = "font-size:1.375rem;margin-bottom:0.875rem;";
  langPanel.appendChild(langTitle);

  const choiceWrap = document.createElement("div");
  choiceWrap.style.cssText = "display:flex;gap:1.25rem;margin-bottom:0.875rem;";
  langPanel.appendChild(choiceWrap);

  const colStyle = "flex:1;text-align:left;";
  const colLabelStyle = "font-size:0.9375rem;color:#bbb;margin-bottom:0.5rem;";
  const langChoiceStyle =
    "display:block;width:100%;padding:0.625rem;margin:0.375rem 0;font:0.9375rem var(--font-ui);color:#fff;" +
    "background:#444;border:none;border-radius:0.375rem;cursor:pointer;text-align:center;";

  // 左栏: 语言
  const langCol = document.createElement("div");
  langCol.style.cssText = colStyle;
  const langColLabel = document.createElement("div");
  langColLabel.style.cssText = colLabelStyle;
  langCol.appendChild(langColLabel);
  const zhBtn = document.createElement("button");
  zhBtn.style.cssText = langChoiceStyle;
  zhBtn.onmouseover = () => (zhBtn.style.background = getLang() === "zh" ? "#3b83d6" : "#555");
  zhBtn.onmouseout = () => (zhBtn.style.background = getLang() === "zh" ? "#4a9eff" : "#444");
  zhBtn.onclick = () => setLang("zh");
  langCol.appendChild(zhBtn);
  const enBtn = document.createElement("button");
  enBtn.style.cssText = langChoiceStyle;
  enBtn.onmouseover = () => (enBtn.style.background = getLang() === "en" ? "#3b83d6" : "#555");
  enBtn.onmouseout = () => (enBtn.style.background = getLang() === "en" ? "#4a9eff" : "#444");
  enBtn.onclick = () => setLang("en");
  langCol.appendChild(enBtn);
  choiceWrap.appendChild(langCol);

  // 右栏: 字体
  const fontCol = document.createElement("div");
  fontCol.style.cssText = colStyle;
  const fontColLabel = document.createElement("div");
  fontColLabel.style.cssText = colLabelStyle;
  fontCol.appendChild(fontColLabel);
  const fontChoiceStyle = langChoiceStyle;
  const mkFontBtn = (id: FontId): HTMLButtonElement => {
    const b = document.createElement("button");
    b.style.cssText = fontChoiceStyle;
    b.onmouseover = () => (b.style.background = getFontId() === id ? "#3b83d6" : "#555");
    b.onmouseout = () => (b.style.background = getFontId() === id ? "#4a9eff" : "#444");
    b.onclick = () => setFontId(id);
    return b;
  };
  const pixelBtn = mkFontBtn("pixel");
  const systemBtn = mkFontBtn("system");
  fontCol.appendChild(pixelBtn);
  fontCol.appendChild(systemBtn);
  choiceWrap.appendChild(fontCol);

  // 按当前语言/字体刷新高亮 (切换后立即重绘)
  const renderLang = (): void => {
    zhBtn.style.background = getLang() === "zh" ? "#4a9eff" : "#444";
    enBtn.style.background = getLang() === "en" ? "#4a9eff" : "#444";
  };
  const renderFont = (): void => {
    pixelBtn.style.background = getFontId() === "pixel" ? "#4a9eff" : "#444";
    systemBtn.style.background = getFontId() === "system" ? "#4a9eff" : "#444";
  };

  const langBackBtn = document.createElement("button");
  langBackBtn.style.cssText = btnStyle;
  langBackBtn.onmouseover = () => (langBackBtn.style.background = "#555");
  langBackBtn.onmouseout = () => (langBackBtn.style.background = "#444");
  langBackBtn.onclick = () => {
    langPanel.style.display = "none";
    settingsPanel.style.display = "block";
  };
  langPanel.appendChild(langBackBtn);

  // 资源包合集: 按钮进入资源包子面板 (列出 game\resourcepacks\ 下的包)
  const packBtn = document.createElement("button");
  packBtn.style.cssText = btnStyle;
  packBtn.onmouseover = () => (packBtn.style.background = "#555");
  packBtn.onmouseout = () => (packBtn.style.background = "#444");
  packBtn.onclick = () => {
    settingsPanel.style.display = "none";
    packPanel.style.display = "block";
    renderPacks();
  };
  settingsPanel.appendChild(packBtn);

  // 资源包子面板: 列出 resourcepacks 目录下的资源包 (内置 default.zip + 用户 zip/文件夹)
  const packPanel = document.createElement("div");
  packPanel.style.cssText =
    "width:17.5rem;background:#222;border-radius:0.625rem;padding:1.25rem;text-align:center;color:#fff;" +
    "font:1rem var(--font-ui);box-shadow:0 0.25rem 1.25rem rgba(0,0,0,.5);display:none;";

  const packTitle = document.createElement("div");
  packTitle.style.cssText = "font-size:1.375rem;margin-bottom:0.875rem;";
  packPanel.appendChild(packTitle);

  const packList = document.createElement("div");
  packList.style.cssText = "max-height:12.5rem;overflow-y:auto;margin-bottom:0.375rem;";
  packPanel.appendChild(packList);

  const packEmpty = document.createElement("div");
  packEmpty.style.cssText = "font-size:0.9375rem;color:#999;padding:0.5rem 0;";
  packPanel.appendChild(packEmpty);

  const renderPacks = (): void => {
    packList.textContent = "";
    const packs = listPacks();
    packEmpty.style.display = packs.length ? "none" : "block";
    packEmpty.textContent = t("settings.packsEmpty");
    for (const p of packs) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0.625rem;margin:0.25rem 0;" +
        "background:#333;border-radius:0.375rem;font-size:0.875rem;";
      const name = document.createElement("span");
      name.textContent = p.name;
      name.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      const meta = document.createElement("span");
      meta.style.cssText = "flex-shrink:0;margin-left:0.5rem;color:#aaa;font-size:0.75rem;";
      meta.textContent = `${p.builtin ? t("settings.packsBuiltin") + " · " : ""}${p.fileCount}`;
      row.append(name, meta);
      packList.appendChild(row);
    }
  };

  const packBackBtn = document.createElement("button");
  packBackBtn.style.cssText = btnStyle;
  packBackBtn.onmouseover = () => (packBackBtn.style.background = "#555");
  packBackBtn.onmouseout = () => (packBackBtn.style.background = "#444");
  packBackBtn.onclick = () => {
    packPanel.style.display = "none";
    settingsPanel.style.display = "block";
  };
  packPanel.appendChild(packBackBtn);

  // 界面缩放: 小/普通/大/自动 (MC 式 GUI Scale)
  const scaleLabel = document.createElement("div");
  scaleLabel.style.cssText = "text-align:left;font-size:0.9375rem;margin:0.5rem 0 0.25rem;";
  settingsPanel.appendChild(scaleLabel);

  const scaleRow = document.createElement("div");
  scaleRow.style.cssText = "display:flex;gap:0.375rem;margin:0 0 0.375rem;";
  const scaleBtnStyle =
    "flex:1;padding:0.5rem;font:0.875rem var(--font-ui);color:#fff;border:none;border-radius:0.375rem;cursor:pointer;";
  const mkScaleBtn = (mode: "small" | "normal" | "large" | "auto"): HTMLButtonElement => {
    const b = document.createElement("button");
    b.style.cssText = scaleBtnStyle;
    b.onmouseover = () => (b.style.background = getUIScaleMode() === mode ? "#3b83d6" : "#555");
    b.onmouseout = () => (b.style.background = getUIScaleMode() === mode ? "#4a9eff" : "#444");
    b.onclick = () => setUIScaleMode(mode);
    return b;
  };
  const scaleBtns: Record<"small" | "normal" | "large" | "auto", HTMLButtonElement> = {
    small: mkScaleBtn("small"),
    normal: mkScaleBtn("normal"),
    large: mkScaleBtn("large"),
    auto: mkScaleBtn("auto"),
  };
  const renderScale = (): void => {
    (Object.keys(scaleBtns) as (keyof typeof scaleBtns)[]).forEach((k) => {
      scaleBtns[k].textContent = t(`uiScale.${k}`);
      scaleBtns[k].style.background = getUIScaleMode() === k ? "#4a9eff" : "#444";
    });
  };
  // 缩放标签实时显示当前生效倍率 (auto 随窗口变化)
  const renderScaleLabel = (): void => {
    scaleLabel.textContent = `${t("settings.uiScale")}: ${t(`uiScale.${getUIScaleMode()}`)} (${getCurrentScale().toFixed(2)}x)`;
  };
  onResizeMerged(renderScaleLabel);
  scaleRow.append(scaleBtns.small, scaleBtns.normal, scaleBtns.large, scaleBtns.auto);
  settingsPanel.appendChild(scaleRow);

  // 窗口模式: 窗口化 / 全屏 (NW.js 运行时切换, 免重启)
  const wmLabel = document.createElement("div");
  wmLabel.style.cssText = "text-align:left;font-size:0.9375rem;margin:0.5rem 0 0.25rem;";
  settingsPanel.appendChild(wmLabel);

  const wmRow = document.createElement("div");
  wmRow.style.cssText = "display:flex;gap:0.375rem;margin:0 0 0.375rem;";
  const wmBtnStyle =
    "flex:1;padding:0.5rem;font:0.875rem var(--font-ui);color:#fff;border:none;border-radius:0.375rem;cursor:pointer;";
  const mkWmBtn = (mode: WindowMode): HTMLButtonElement => {
    const b = document.createElement("button");
    b.style.cssText = wmBtnStyle;
    b.onmouseover = () => (b.style.background = opts.getWindowMode() === mode ? "#3b83d6" : "#555");
    b.onmouseout = () => (b.style.background = opts.getWindowMode() === mode ? "#4a9eff" : "#444");
    b.onclick = () => opts.onSetWindowMode(mode);
    return b;
  };
  const wmBtns: Record<WindowMode, HTMLButtonElement> = {
    windowed: mkWmBtn("windowed"),
    fullscreen: mkWmBtn("fullscreen"),
  };
  const renderWm = (): void => {
    (Object.keys(wmBtns) as WindowMode[]).forEach((k) => {
      wmBtns[k].textContent = t(`windowMode.${k}`);
      wmBtns[k].style.background = opts.getWindowMode() === k ? "#4a9eff" : "#444";
    });
  };
  wmRow.append(wmBtns.windowed, wmBtns.fullscreen);
  settingsPanel.appendChild(wmRow);

  onUIScaleModeChange(renderScale);
  onWindowModeChange(renderWm);
  onFontChange(renderFont);

  const backBtn = document.createElement("button");
  backBtn.style.cssText = btnStyle;
  backBtn.onmouseover = () => (backBtn.style.background = "#555");
  backBtn.onmouseout = () => (backBtn.style.background = "#444");
  backBtn.onclick = () => {
    settingsPanel.style.display = "none";
    opts.onBack();
  };
  settingsPanel.appendChild(backBtn);

  const refresh = (): void => {
    sTitle.textContent = t("menu.settings");
    capLabel.textContent = t("settings.fpsCap");
    renderCap();
    renderGpuBtn();
    langBtn.textContent = t("settings.languageFont");
    langTitle.textContent = t("settings.languageFont");
    langColLabel.textContent = t("settings.language");
    fontColLabel.textContent = t("settings.font");
    zhBtn.textContent = t("lang.zh");
    enBtn.textContent = t("lang.en");
    pixelBtn.textContent = t("fonts.pixel");
    systemBtn.textContent = t("fonts.system");
    renderLang();
    renderFont();
    packBtn.textContent = t("settings.resourcepacks");
    packTitle.textContent = t("settings.resourcepacks");
    packBackBtn.textContent = t("menu.back");
    if (packPanel.style.display === "block") renderPacks();
    renderScale();
    renderScaleLabel();
    wmLabel.textContent = t("settings.windowMode");
    renderWm();
    backBtn.textContent = t("menu.back");
    langBackBtn.textContent = t("menu.back");
  };
  onLangChange(refresh);
  refresh();

  return { settingsPanel, langPanel, packPanel };
}

export class Menu {
  visible = false;

  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly settingsPanel: HTMLDivElement;
  private readonly langPanel: HTMLDivElement;
  private readonly packPanel: HTMLDivElement;
  private readonly onResume: () => void;
  private readonly onToMainMenu: () => void;
  private readonly title: HTMLDivElement;
  private readonly resumeBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;
  private readonly toMainMenuBtn: HTMLButtonElement;

  constructor(
    onResume: () => void,
    onFpsCap: (cap: number) => void,
    onToggleGpuVsync: (on: boolean) => boolean,
    getGpuVsyncState: () => boolean,
    getFpsCap: () => number,
    getWindowMode: () => WindowMode,
    onSetWindowMode: (mode: WindowMode) => void,
    onToMainMenu: () => void,
  ) {
    this.onResume = onResume;
    this.onToMainMenu = onToMainMenu;

    const btnStyle =
      "display:block;width:100%;padding:0.625rem;margin:0.375rem 0;font:0.9375rem var(--font-ui);color:#fff;" +
      "background:#444;border:none;border-radius:0.375rem;cursor:pointer;";

    this.root = document.createElement("div");
    this.root.style.cssText =
      "position:fixed;inset:0;z-index:30;display:none;align-items:center;justify-content:center;" +
      "background:rgba(0,0,0,.55);";
    uiStage.appendChild(this.root);

    this.panel = document.createElement("div");
    this.panel.style.cssText =
      "width:17.5rem;background:#222;border-radius:0.625rem;padding:1.25rem;text-align:center;color:#fff;" +
      "font:1rem var(--font-ui);box-shadow:0 0.25rem 1.25rem rgba(0,0,0,.5);";
    this.root.appendChild(this.panel);

    this.title = document.createElement("div");
    this.title.style.cssText = "font-size:1.375rem;margin-bottom:0.875rem;";
    this.panel.appendChild(this.title);

    this.resumeBtn = document.createElement("button");
    this.resumeBtn.style.cssText = btnStyle;
    this.resumeBtn.onmouseover = () => (this.resumeBtn.style.background = "#555");
    this.resumeBtn.onmouseout = () => (this.resumeBtn.style.background = "#444");
    this.resumeBtn.onclick = () => {
      this.hide();
      this.onResume();
    };
    this.panel.appendChild(this.resumeBtn);

    this.settingsBtn = document.createElement("button");
    this.settingsBtn.style.cssText = btnStyle;
    this.settingsBtn.onmouseover = () => (this.settingsBtn.style.background = "#555");
    this.settingsBtn.onmouseout = () => (this.settingsBtn.style.background = "#444");
    this.settingsBtn.onclick = () => {
      this.panel.style.display = "none";
      this.settingsPanel.style.display = "block";
    };
    this.panel.appendChild(this.settingsBtn);

    this.toMainMenuBtn = document.createElement("button");
    this.toMainMenuBtn.style.cssText = btnStyle;
    this.toMainMenuBtn.onmouseover = () => (this.toMainMenuBtn.style.background = "#555");
    this.toMainMenuBtn.onmouseout = () => (this.toMainMenuBtn.style.background = "#444");
    this.toMainMenuBtn.onclick = () => {
      this.hide();
      this.onToMainMenu();
    };
    this.panel.appendChild(this.toMainMenuBtn);

    const panels = buildSettingsPanel({
      getFpsCap,
      onFpsCap,
      getGpuVsyncState,
      onToggleGpuVsync,
      getWindowMode,
      onSetWindowMode,
      onBack: () => {
        this.panel.style.display = "block";
      },
    });
    this.settingsPanel = panels.settingsPanel;
    this.langPanel = panels.langPanel;
    this.packPanel = panels.packPanel;
    this.root.appendChild(this.settingsPanel);
    this.root.appendChild(this.langPanel);
    this.root.appendChild(this.packPanel);

    const refresh = (): void => {
      this.title.textContent = t("menu.paused");
      this.resumeBtn.textContent = t("menu.resume");
      this.settingsBtn.textContent = t("menu.settings");
      this.toMainMenuBtn.textContent = t("menu.toMainMenu");
    };
    onLangChange(refresh);
    refresh();
  }

  get settingsVisible(): boolean {
    return this.settingsPanel.style.display === "block";
  }

  get langVisible(): boolean {
    return this.langPanel.style.display === "block";
  }

  get packVisible(): boolean {
    return this.packPanel.style.display === "block";
  }

  goBack(): void {
    if (this.packVisible) {
      this.packPanel.style.display = "none";
      this.settingsPanel.style.display = "block";
    } else if (this.langVisible) {
      this.langPanel.style.display = "none";
      this.settingsPanel.style.display = "block";
    } else if (this.settingsVisible) {
      this.settingsPanel.style.display = "none";
      this.panel.style.display = "block";
    }
  }

  show(): void {
    this.visible = true;
    this.root.style.display = "flex";
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = "none";
  }
}