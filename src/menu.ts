// ===== 暂停菜单 + 共享设置面板 (帧率上限/垂直同步), 主菜单也复用设置面板 =====

export interface SettingsCallbacks {
  getFpsCap: () => number;
  onFpsCap: (cap: number) => void;
  getGpuVsyncState: () => boolean;
  onToggleGpuVsync: (on: boolean) => boolean;
}

// 共享设置面板: 帧率上限滑条 + 垂直同步开关 + 返回按钮 (暂停菜单/主菜单共用)
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
  sTitle.textContent = "设置";
  sTitle.style.cssText = "font-size:22px;margin-bottom:14px;";
  settingsPanel.appendChild(sTitle);

  const capLabel = document.createElement("div");
  capLabel.textContent = "帧率上限";
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
    capValue.textContent = Number(capSlider.value) >= CAP_MAX ? "无限" : `${capSlider.value} FPS`;
  };
  capSlider.oninput = () => {
    renderCap();
    opts.onFpsCap(Number(capSlider.value) >= CAP_MAX ? 0 : Number(capSlider.value));
  };
  renderCap();
  settingsPanel.appendChild(capSlider);

  let gpuVsyncOn = opts.getGpuVsyncState();
  const gpuBtn = document.createElement("button");
  gpuBtn.style.cssText = btnStyle;
  gpuBtn.onmouseover = () => (gpuBtn.style.background = "#555");
  gpuBtn.onmouseout = () => (gpuBtn.style.background = "#444");
  const renderGpuBtn = (): void => {
    gpuBtn.textContent = gpuVsyncOn
      ? "垂直同步: 已关闭(重启生效)"
      : "垂直同步: 已开启(重启生效)";
  };
  gpuBtn.onclick = () => {
    const next = !gpuVsyncOn;
    if (opts.onToggleGpuVsync(next)) {
      gpuVsyncOn = next;
      renderGpuBtn();
    }
  };
  renderGpuBtn();
  settingsPanel.appendChild(gpuBtn);

  const backBtn = document.createElement("button");
  backBtn.textContent = "返回";
  backBtn.style.cssText = btnStyle;
  backBtn.onmouseover = () => (backBtn.style.background = "#555");
  backBtn.onmouseout = () => (backBtn.style.background = "#444");
  backBtn.onclick = () => {
    settingsPanel.style.display = "none";
    opts.onBack();
  };
  settingsPanel.appendChild(backBtn);

  return settingsPanel;
}

export class Menu {
  visible = false;

  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly settingsPanel: HTMLDivElement;
  private readonly onResume: () => void;

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

    const title = document.createElement("div");
    title.textContent = "暂停";
    title.style.cssText = "font-size:22px;margin-bottom:14px;";
    this.panel.appendChild(title);

    const resumeBtn = document.createElement("button");
    resumeBtn.textContent = "回到游戏";
    resumeBtn.style.cssText = btnStyle;
    resumeBtn.onmouseover = () => (resumeBtn.style.background = "#555");
    resumeBtn.onmouseout = () => (resumeBtn.style.background = "#444");
    resumeBtn.onclick = () => {
      this.hide();
      this.onResume();
    };
    this.panel.appendChild(resumeBtn);

    const settingsBtn = document.createElement("button");
    settingsBtn.textContent = "设置";
    settingsBtn.style.cssText = btnStyle;
    settingsBtn.onmouseover = () => (settingsBtn.style.background = "#555");
    settingsBtn.onmouseout = () => (settingsBtn.style.background = "#444");
    settingsBtn.onclick = () => {
      this.panel.style.display = "none";
      this.settingsPanel.style.display = "block";
    };
    this.panel.appendChild(settingsBtn);

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