// ===== 主界面 (标题 voxelcraft + 单人/多人/设置/退出) =====
import { buildSettingsPanel, type SettingsCallbacks } from "./menu";

export interface MainMenuCallbacks extends SettingsCallbacks {
  onStartSingle: () => void;
  onMultiplayer: () => void;
  onExit: () => void;
}

export class MainMenu {
  visible = false;

  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly settingsPanel: HTMLDivElement;

  constructor(cb: MainMenuCallbacks) {
    const btnBase =
      "display:block;width:100%;padding:12px;margin:8px 0;font:16px 'Segoe UI',sans-serif;color:#fff;" +
      "background:linear-gradient(#6a6a6a,#4d4d4d);border:2px solid #1a1a1a;border-top-color:#7a7a7a;" +
      "border-left-color:#7a7a7a;box-shadow:inset 0 1px 0 rgba(255,255,255,.15),0 2px 4px rgba(0,0,0,.6);" +
      "cursor:pointer;text-shadow:0 2px 0 rgba(0,0,0,.5);";
    const btnHover = "filter:brightness(1.25);";
    const btnDown = "transform:translateY(1px);";
    const mkBtn = (label: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = btnBase;
      b.onmouseover = () => (b.style.cssText = btnBase + btnHover);
      b.onmouseout = () => (b.style.cssText = btnBase);
      b.onmousedown = () => (b.style.cssText = btnBase + btnHover + btnDown);
      b.onmouseup = () => (b.style.cssText = btnBase + btnHover);
      b.onclick = onClick;
      return b;
    };

    this.root = document.createElement("div");
    this.root.style.cssText =
      "position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;" +
      "background:rgba(0,0,0,.5);";
    document.body.appendChild(this.root);

    this.panel = document.createElement("div");
    this.panel.style.cssText =
      "width:300px;text-align:center;font-family:'Segoe UI',sans-serif;";
    this.root.appendChild(this.panel);

    const title = document.createElement("div");
    title.textContent = "voxelcraft";
    title.style.cssText =
      "font-size:52px;font-weight:800;color:#fff;margin-bottom:28px;letter-spacing:2px;" +
      "text-shadow:0 4px 0 #2a2a2a,0 6px 12px rgba(0,0,0,.6);";
    this.panel.appendChild(title);

    this.panel.appendChild(mkBtn("单人模式", cb.onStartSingle));
    this.panel.appendChild(mkBtn("多人模式", cb.onMultiplayer));
    this.panel.appendChild(
      mkBtn("设置", () => {
        this.panel.style.display = "none";
        this.settingsPanel.style.display = "block";
      }),
    );
    this.panel.appendChild(mkBtn("退出游戏", cb.onExit));

    this.settingsPanel = buildSettingsPanel({
      getFpsCap: cb.getFpsCap,
      onFpsCap: cb.onFpsCap,
      getGpuVsyncState: cb.getGpuVsyncState,
      onToggleGpuVsync: cb.onToggleGpuVsync,
      onBack: () => {
        this.settingsPanel.style.display = "none";
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