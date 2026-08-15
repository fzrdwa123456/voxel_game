// ===== MC 式游戏模式切换 (F3+F4): 生存 / 创造 / 观察者, 松开 F3 应用 =====
import { FirstPersonCamera, MODE_NAMES, type MoveMode } from "./camera";
import type { Hud } from "./hud";
import { t, onLangChange } from "./i18n";
import { registerUIScalable } from "./uiscale";

const GM_MODES: MoveMode[] = ["walk", "fly", "spectator"];

export class GamemodeController {
  private f3Down = false;
  private f4Down = false;
  private menuOpen = false;
  private sel = 0;
  private readonly menu: HTMLDivElement;
  private readonly itemEls: HTMLDivElement[] = [];
  private readonly title: HTMLDivElement;

  constructor(
    private readonly hud: Hud,
    private readonly fps: FirstPersonCamera,
    private readonly sendLog: (line: string) => void,
  ) {
    this.menu = document.createElement("div");
    this.menu.style.cssText =
      "position:fixed;bottom:100px;left:50%;transform:translateX(-50%);z-index:25;display:none;text-align:center;font:14px/1.6 'Segoe UI',sans-serif;";
    this.menu.innerHTML =
      `<div id="gmTitle" style="color:#fff;text-shadow:0 1px 2px #000;font-weight:600;margin-bottom:4px;"></div>` +
      `<div id="gmItems" style="display:flex;gap:8px;justify-content:center;"></div>`;
    document.body.appendChild(this.menu);
    this.title = this.menu.querySelector("#gmTitle") as HTMLDivElement;
    const items = this.menu.querySelector("#gmItems") as HTMLDivElement;
    for (const m of GM_MODES) {
      const el = document.createElement("div");
      el.style.cssText =
        "padding:4px 14px;border-radius:4px;color:#fff;background:rgba(0,0,0,.45);border:2px solid transparent;text-shadow:0 1px 2px #000;";
      items.appendChild(el);
      this.itemEls.push(el);
    }

    const refresh = (): void => {
      this.title.textContent = t("gamemode.title");
      this.itemEls.forEach((el, i) => {
        el.textContent = t(`mode.${GM_MODES[i]}`);
      });
    };
    onLangChange(refresh);
    refresh();

    // 模式选择条随界面缩放 (已有 translateX 居中, 需组合)
    registerUIScalable((s) => {
      this.menu.style.transform = `translateX(-50%) scale(${s})`;
      this.menu.style.transformOrigin = "bottom center";
    });

    document.addEventListener("keydown", (ev) => this.onKeyDown(ev));
    document.addEventListener("keyup", (ev) => this.onKeyUp(ev));
  }

  private onKeyDown(ev: KeyboardEvent): void {
    if (ev.code === "F3") {
      this.f3Down = true;
      if (this.f4Down) {
        this.open();
        return;
      }
      this.hud.toggleDebug();
    } else if (ev.code === "F4") {
      this.f4Down = true;
      if (this.menuOpen) this.cycle();
      else if (this.f3Down) this.open();
    }
  }

  private onKeyUp(ev: KeyboardEvent): void {
    if (ev.code === "F3") {
      this.f3Down = false;
      if (this.menuOpen) this.apply();
    } else if (ev.code === "F4") {
      this.f4Down = false;
    }
  }

  private open(): void {
    this.sel = GM_MODES.indexOf(this.fps.mode);
    this.menu.style.display = "block";
    this.menuOpen = true;
    this.render();
  }

  private cycle(): void {
    this.sel = (this.sel + 1) % GM_MODES.length;
    this.render();
  }

  private render(): void {
    this.itemEls.forEach((el, i) => {
      el.style.borderColor = i === this.sel ? "#fff" : "transparent";
      el.style.background = i === this.sel ? "rgba(255,255,255,.25)" : "rgba(0,0,0,.45)";
    });
  }

  private apply(): void {
    this.menuOpen = false;
    this.menu.style.display = "none";
    const m = GM_MODES[this.sel];
    if (m !== this.fps.mode) {
      this.fps.setMode(m);
      this.sendLog(`MODE 切换 → ${m} (${MODE_NAMES[m]})`);
    }
  }
}