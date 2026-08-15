// ===== 暂停菜单 + 共享设置面板 (帧率上限/垂直同步/语言/界面缩放), 主菜单也复用设置面板 =====
import { t, getLang, setLang, onLangChange } from "./i18n";
import { getUIScaleMode, setUIScaleMode, onUIScaleModeChange, registerUIScalable } from "./uiscale";

export interface SettingsCallbacks {
  getFpsCap: () => number;
  onFpsCap: (cap: number) => void;
  getGpuVsyncState: () => boolean;
  onToggleGpuVsync: (on: boolean) => boolean;
}

// 共享设置面板: 帧率上限滑条 + 垂直同步开关 + 语言选择 + 返回按钮 (暂停菜单/主菜单共用)
export function buildSettingsPanel(
  opts: SettingsCallbacks & { onBack: () => void },
): HTMLDivElement {
  const btnStyle =
    "display:block;width:100%;padding:10px;margin:6px 0;font:15px sans-serif;color:#fff;" +
    "background:#444;border:none;border-radius:6px;cursor:pointer;";

  const settingsPanel = document.createElement("div");
  settingsPanel.style.cssText =
    "width:280px;background:#222;border-radius:10px;padding:20px;text-align:center;color:#fff;" +
    "font:16px sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.5);display:none;";

  const sTitle = document.createElement("div");
  sTitle.style.cssText = "font-size:22px;margin-bottom:14px;";
  settingsPanel.appendChild(sTitle);

  const capLabel = document.createElement("div");
  capLabel.style.cssText = "text-align:left;font-size:15px;margin:8px 0 4px;";
  settingsPanel.appendChild(capLabel);

  const capValue = document.createElement("div");
  capValue.style.cssText =
    "text-align:center;font-size:20px;font-weight:600;color:#fff;margin:2px 0 6px;";
  settingsPanel.appendChild(capValue);

  const CAP_MIN = 30;
  const CAP_MAX = 240; // 拉满 = 无限
  const capSlider = document.createElement("input");
  capSlider.type = "range";
  capSlider.min = String(CAP_MIN);
  capSlider.max = String(CAP_MAX);
  capSlider.step = "2";
  capSlider.value = String(Math.max(CAP_MIN, Math.min(CAP_MAX, opts.getFpsCap() || CAP_MAX)));
  capSlider.style.cssText = "width:100%;margin:0 0 10px;accent-color:#4a9eff;cursor:pointer;";
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

  // 语言选择器: 简体中文 / English, 切换即全局刷新
  const langLabel = document.createElement("div");
  langLabel.style.cssText = "text-align:left;font-size:15px;margin:8px 0 4px;";
  settingsPanel.appendChild(langLabel);

  const langRow = document.createElement("div");
  langRow.style.cssText = "display:flex;gap:6px;margin:0 0 6px;";
  const langBtnStyle =
    "flex:1;padding:8px;font:14px sans-serif;color:#fff;border:none;border-radius:6px;cursor:pointer;";
  const mkLangBtn = (key: string, lang: "zh" | "en"): HTMLButtonElement => {
    const b = document.createElement("button");
    b.textContent = t(key);
    b.style.cssText = langBtnStyle;
    b.onmouseover = () => (b.style.background = getLang() === lang ? "#3b83d6" : "#555");
    b.onmouseout = () => (b.style.background = getLang() === lang ? "#4a9eff" : "#444");
    b.onclick = () => setLang(lang);
    return b;
  };
  const zhBtn = mkLangBtn("lang.zh", "zh");
  const enBtn = mkLangBtn("lang.en", "en");
  const renderLang = (): void => {
    zhBtn.style.background = getLang() === "zh" ? "#4a9eff" : "#444";
    enBtn.style.background = getLang() === "en" ? "#4a9eff" : "#444";
  };
  langRow.append(zhBtn, enBtn);
  settingsPanel.appendChild(langRow);

  // 界面缩放: 小/普通/大/自动 (MC 式 GUI Scale)
  const scaleLabel = document.createElement("div");
  scaleLabel.style.cssText = "text-align:left;font-size:15px;margin:8px 0 4px;";
  settingsPanel.appendChild(scaleLabel);

  const scaleRow = document.createElement("div");
  scaleRow.style.cssText = "display:flex;gap:6px;margin:0 0 6px;";
  const scaleBtnStyle =
    "flex:1;padding:8px;font:14px sans-serif;color:#fff;border:none;border-radius:6px;cursor:pointer;";
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
  scaleRow.append(scaleBtns.small, scaleBtns.normal, scaleBtns.large, scaleBtns.auto);
  settingsPanel.appendChild(scaleRow);

  // 设置面板自身随界面缩放
  registerUIScalable((s) => {
    settingsPanel.style.transform = `scale(${s})`;
    settingsPanel.style.transformOrigin = "center";
  });
  onUIScaleModeChange(renderScale);

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
    langLabel.textContent = t("settings.language");
    zhBtn.textContent = t("lang.zh");
    enBtn.textContent = t("lang.en");
    renderLang();
    scaleLabel.textContent = t("settings.uiScale");
    renderScale();
    backBtn.textContent = t("menu.back");
  };
  onLangChange(refresh);
  refresh();

  return settingsPanel;
}

export class Menu {
  visible = false;

  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly settingsPanel: HTMLDivElement;
  private readonly onResume: () => void;
  private readonly title: HTMLDivElement;
  private readonly resumeBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;

  constructor(
    onResume: () => void,
    onFpsCap: (cap: number) => void,
    onToggleGpuVsync: (on: boolean) => boolean,
    getGpuVsyncState: () => boolean,
    getFpsCap: () => number,
  ) {
    this.onResume = onResume;

    const btnStyle =
      "display:block;width:100%;padding:10px;margin:6px 0;font:15px sans-serif;color:#fff;" +
      "background:#444;border:none;border-radius:6px;cursor:pointer;";

    this.root = document.createElement("div");
    this.root.style.cssText =
      "position:fixed;inset:0;z-index:30;display:none;align-items:center;justify-content:center;" +
      "background:rgba(0,0,0,.55);";
    document.body.appendChild(this.root);

    this.panel = document.createElement("div");
    this.panel.style.cssText =
      "width:280px;background:#222;border-radius:10px;padding:20px;text-align:center;color:#fff;" +
      "font:16px sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.5);";
    this.root.appendChild(this.panel);

    this.title = document.createElement("div");
    this.title.style.cssText = "font-size:22px;margin-bottom:14px;";
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

    this.settingsPanel = buildSettingsPanel({
      getFpsCap,
      onFpsCap,
      getGpuVsyncState,
      onToggleGpuVsync,
      onBack: () => {
        this.panel.style.display = "block";
      },
    });
    this.root.appendChild(this.settingsPanel);

    const refresh = (): void => {
      this.title.textContent = t("menu.paused");
      this.resumeBtn.textContent = t("menu.resume");
      this.settingsBtn.textContent = t("menu.settings");
    };
    onLangChange(refresh);
    refresh();

    // 暂停面板 + 设置面板随界面缩放 (注册在构造末尾, 已持全部子元素引用)
    registerUIScalable((s) => {
      this.panel.style.transform = `scale(${s})`;
      this.panel.style.transformOrigin = "center";
    });
  }

  get settingsVisible(): boolean {
    return this.settingsPanel.style.display === "block";
  }

  goBack(): void {
    if (this.settingsVisible) {
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