// ===== 调试日志增量转发 =====
// 把相机各诊断队列 (形如 "XXX#序号 ...") 的新条目按序号游标转发到 debug.log。
// 每个队列一个游标, 统一在这里管理, 替代 main.ts 里逐队列的样板循环。
import { sendLog } from "./shell";
import type { FirstPersonCamera } from "./camera";

export class DebugLogForwarder {
  private cursors = new Map<string, number>();

  /** 转发单个队列的新条目: label 同时是行首标记与游标键 */
  private forwardQueue(label: string, lines: readonly string[]): void {
    let last = this.cursors.get(label) ?? 0;
    if (last > lines.length) last = 0; // 队列环形覆盖后游标失效, 重置
    for (const line of lines) {
      const m = new RegExp(`^${label}#(\\d+)`).exec(line);
      if (m && Number(m[1]) > last) {
        sendLog(line);
        last = Number(m[1]);
      }
    }
    this.cursors.set(label, last);
  }

  /** 转发相机的全部诊断队列 (每帧统计块调用一次) */
  forward(fps: FirstPersonCamera): void {
    this.forwardQueue("SPACE", fps.spaceLog);
    this.forwardQueue("MOUSE", fps.mouseLog);
  }
}
