// ===== 性能采样 =====
// FPS 统计 (固定窗口) + GPU 渲染耗时 EMA 平滑, 从 main.ts 渲染循环抽出。

export interface PerfWindow {
  /** 窗口内平均 FPS */
  fps: number;
  /** 最近 GPU 渲染耗时 ms (EMA; 无 timestamp-query 支持时为 null) */
  gpuMs: number | null;
}

export class PerfSampler {
  private fpsFrames = 0;
  private fpsTimer = 0;
  private gpuRenderMs = 0;
  private gpuSamples = 0;

  /** 每帧调用 (delta 秒)。攒满窗口期返回一次统计并重置, 未满返回 null */
  sample(delta: number, windowSec = 0.5): PerfWindow | null {
    this.fpsTimer += delta;
    this.fpsFrames++;
    if (this.fpsTimer < windowSec) return null;
    const fps = this.fpsFrames / this.fpsTimer;
    this.fpsFrames = 0;
    this.fpsTimer = 0;
    return { fps, gpuMs: this.gpuSamples > 0 ? this.gpuRenderMs : null };
  }

  /** 异步收取 GPU 渲染耗时 (renderer.resolveTimestampsAsync 的回调), EMA 平滑 */
  noteGpu(ms: number): void {
    this.gpuSamples++;
    this.gpuRenderMs = this.gpuSamples === 1 ? ms : this.gpuRenderMs * 0.7 + ms * 0.3;
  }
}
