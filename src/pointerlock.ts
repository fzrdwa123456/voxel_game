// ===== 鼠标锁定管理 =====
import type { FirstPersonCamera } from "./camera";

export interface PointerLockDeps {
  fps: FirstPersonCamera;
  isMenuOpen: () => boolean;
  isInvOpen: () => boolean;
  sendLog: (line: string) => void;
}

// 所有 relock() 调用都来自用户主动交互 (点单人模式/E 关背包/ESC 回游戏), 不再做焦点门控:
// 窗口非前台时 Chromium 会拒绝 requestPointerLock (触发 1300ms 重试), 天然防止"罩住鼠标"。
export class PointerLock {
  constructor(private readonly deps: PointerLockDeps) {}

  relock(): void {
    const tryLock = (): void => {
      if (this.deps.isMenuOpen() || this.deps.isInvOpen()) return;
      const p = this.deps.fps.lock();
      if (p) {
        p.catch(() => {
          this.deps.sendLog("LOCK 被拒(可能无用户手势), 1300ms 后重试");
          setTimeout(tryLock, 1300);
        });
      }
    };
    tryLock();
  }

  // 光标: 游戏运行中隐藏 (无主界面, 用准星 HUD), 菜单/背包打开时显示
  applyCursor(): void {
    const uiOpen = this.deps.isMenuOpen() || this.deps.isInvOpen();
    document.body.style.cursor = uiOpen ? "default" : "none";
    this.deps.fps.clickLockAllowed = !uiOpen;
  }
}