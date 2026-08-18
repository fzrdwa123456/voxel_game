import * as THREE from "three/webgpu";
import type { BlockWorld } from "./blocks";

export const EYE_HEIGHT = 1.6;
const HALF_WIDTH = 0.3;
const BODY_HEIGHT = 1.8;
const GRAVITY = 24;
const JUMP_SPEED = 7.5;
const WALK_SPEED = 4.2;
const FLY_SPEED = 4.2;
const EPS = 1e-4;
const DOUBLE_TAP_MS = 250;

export type MoveMode = "walk" | "fly" | "spectator";

export const MODE_NAMES: Record<MoveMode, string> = {
  walk: "生存模式",
  fly: "创造模式",
  spectator: "观察者模式",
};

export class FirstPersonCamera {
  position: THREE.Vector3;
  /** 最近一次物理步进前的位置快照 (渲染插值用, MC 式固定步长) */
  private prevPosition = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  locked = false;
  /** 点击画布是否允许抢锁 (菜单/背包打开时由 main.ts 置 false, 防止菜单开着鼠标被捕获) */
  clickLockAllowed = true;
  speed = 4.2;
  mode: MoveMode = "walk";

  private readonly camera: THREE.PerspectiveCamera;
  private readonly dom: HTMLElement;
  private readonly log: (line: string) => void;
  private readonly sensitivity = 0.002;
  private readonly keys = new Set<string>();
  private world: BlockWorld | null = null;
  vy = 0;
  onGround = false;
  /** 创造模式飞行子状态: false=走路(生存物理), true=飞行 */
  flying = false;
  private lastSpaceDown = 0;
  private spaceSeq = 0;
  /** 空格按键事件日志 (最近 10 条, 供 F3 调试面板显示) */
  readonly spaceLog: string[] = [];
  /** 水平碰撞被挡事件日志 (最近 10 条, 残差极小=疑似空气墙) */
  readonly wallLog: string[] = [];
  private wallSeq = 0;
  private lastWallLog = 0;
  /** 垂直顶起事件日志 (最近 10 条, resolveEmbedding 触发时记录, 用于诊断贴墙抖动) */
  readonly embedLog: string[] = [];
  private embedSeq = 0;
  /** 水平碰撞被挡事件日志 (每次 clamp 都记录, 不限残差, 用于诊断贴墙抖动) */
  readonly wallhLog: string[] = [];
  private wallhSeq = 0;
  private lastWallhLog = 0;
  /** 逐帧振荡诊断: clamp 触发后连续记录 60 帧位置(dt/x/z 精确值), 捕获亚 100ms 抖动 */
  readonly burstLog: string[] = [];
  private burstSeq = 0;
  private burstActive = false;
  private burstFrames = 0;
  private burstTrigger = "";
  private burstCooldownUntil = 0;
  /** 鼠标移动事件日志 (限频 100ms, 供 F3 显示 + debug.log 关联输入与抖动) */
  readonly mouseLog: string[] = [];
  private mouseSeq = 0;
  private lastMouseLog = 0;
  /** 本帧累计鼠标位移 (burst 每帧行用, 记录后清零) */
  private mmAccumX = 0;
  private mmAccumY = 0;
  /** 忽略锁定瞬间浏览器合成的一次假位移 (首帧 mousemove 不转视角) */
  private skipFirstMove = false;
  /** 主动解锁前预置宽限期: 吞掉 exitPointerLock + SetCursorPos 竞态期间 (仍处于锁定态) 的合成位移 */
  private lockGraceUntil = 0;

  constructor(
    camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    log: (line: string) => void = () => {},
  ) {
    this.camera = camera;
    this.dom = dom;
    this.log = log;
    this.position = camera.position.clone();

    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    this.yaw = e.y;
    this.pitch = e.x;

    this.dom.addEventListener("click", () => {
      if (this.clickLockAllowed) {
        this.log("LOCK click抢锁");
        this.requestLock();
      }
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.dom;
      if (this.locked) this.skipFirstMove = true;
    });
    document.addEventListener("mousemove", (ev) => {
      if (!this.locked) return;
      // 解锁竞态窗口内 (prepareUnlock 到 pointerlockchange(false) 之间) 不转视角
      if (performance.now() < this.lockGraceUntil) return;
      if (this.skipFirstMove) {
        this.skipFirstMove = false;
        return;
      }
      this.mmAccumX += ev.movementX;
      this.mmAccumY += ev.movementY;
      this.yaw -= ev.movementX * this.sensitivity;
      this.pitch -= ev.movementY * this.sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

      // 鼠标事件日志 (限频 100ms): 关联鼠标输入与贴墙抖动
      const now = performance.now();
      if (now - this.lastMouseLog >= 100) {
        this.lastMouseLog = now;
        this.mouseLog.unshift(
          `MOUSE#${this.mouseSeq++} mmX=${ev.movementX.toFixed(1)} mmY=${ev.movementY.toFixed(1)} ` +
            `yaw=${this.yaw.toFixed(6)} pitch=${this.pitch.toFixed(6)}`,
        );
        if (this.mouseLog.length > 10) this.mouseLog.pop();
      }
    });
    document.addEventListener("keydown", (ev) => this.onKeyDown(ev));
    document.addEventListener("keyup", (ev) => this.keys.delete(ev.code));
  }

  setWorld(world: BlockWorld): void {
    this.world = world;
  }

  /** 方块格 (bx,by,bz)..(bx+1,by+1,bz+1) 是否与玩家碰撞箱重叠 */
  overlaps(bx: number, by: number, bz: number): boolean {
    const feet = this.position.y - EYE_HEIGHT;
    return (
      this.position.x + HALF_WIDTH > bx &&
      this.position.x - HALF_WIDTH < bx + 1 &&
      feet + BODY_HEIGHT > by &&
      feet + 1e-7 < by + 1 &&
      this.position.z + HALF_WIDTH > bz &&
      this.position.z - HALF_WIDTH < bz + 1
    );
  }

  /** 每帧空间检测: 玩家碰撞箱与所有方块重叠则垂直顶起 (仅当脚底在方块底之上, 即"落上"而非"被压") */
  resolveEmbedding(): void {
    const feet = this.position.y - EYE_HEIGHT;
    let top = -Infinity;
    let push = false;
    this.world?.forEach((bx, by, bz) => {
      if (this.overlaps(bx, by, bz) && feet > by) {
        top = Math.max(top, by + 1);
        push = true;
      }
    });
    if (push) {
      const before = this.position.y;
      this.position.y = top + EYE_HEIGHT;
      if (this.vy < 0) this.vy = 0;
      // 诊断日志: 每帧顶起 = 玩家斜向贴墙时横向穿墙被顶到墙顶 (贴墙抖动根因)
      this.embedLog.unshift(
        `EMBED#${this.embedSeq++} 顶起 y=${before.toFixed(4)}->${this.position.y.toFixed(4)} ` +
          `feet=${feet.toFixed(4)} 顶=${top.toFixed(4)}`,
      );
      if (this.embedLog.length > 10) this.embedLog.pop();
    }
  }

  /** 主动解锁前先进入宽限期: 吞掉 exitPointerLock + SetCursorPos 竞态期间 (仍处于锁定态) 的合成位移 */
  prepareUnlock(): void {
    this.lockGraceUntil = performance.now() + 100;
  }

  /** 请求指针锁定: 直接普通 requestPointerLock。
   *  不用 unadjustedMovement: NW.js 的 Windows raw input (RIDEV_INPUTSINK) 注册会间歇失败
   *  -> NotSupportedError, 且同步回退的普通请求会被挂起的 browser 流程拒为 kAlreadyLocked (双失败)。
   *  锁定瞬间的假位移由 skipFirstMove + lockGrace 兜住。 */
  private requestLock(): Promise<void> | undefined {
    return this.dom.requestPointerLock() as Promise<void> | undefined;
  }

  lock(): Promise<void> | undefined {
    return this.requestLock();
  }

  /** 水平重叠方块中, 玩家脚下(或头顶)最近的方块顶面 y 值 */
  groundTop(): number {
    const feet = this.position.y - EYE_HEIGHT;
    let top = -Infinity;
    this.world?.forEach((bx, by, bz) => {
      if (
        this.position.x + HALF_WIDTH > bx &&
        this.position.x - HALF_WIDTH < bx + 1 &&
        this.position.z + HALF_WIDTH > bz &&
        this.position.z - HALF_WIDTH < bz + 1
      ) {
        top = Math.max(top, by + 1);
      }
    });
    return top === -Infinity ? NaN : top;
  }

  private onKeyDown(ev: KeyboardEvent): void {
    this.keys.add(ev.code);
    if (ev.code === "Space") {
      const feet = this.position.y - EYE_HEIGHT;
      const top = this.groundTop();
      let action: string;
      if (ev.repeat) {
        action = "repeat(按住, 忽略)";
      } else if (this.mode === "fly") {
        const now = performance.now();
        const isDouble = now - this.lastSpaceDown < DOUBLE_TAP_MS;
        this.lastSpaceDown = now;
        if (isDouble) {
          this.flying = !this.flying;
          this.vy = 0;
          this.onGround = false;
          action = `双击 → ${this.flying ? "开启" : "关闭"}飞行`;
        } else if (!this.flying && this.onGround) {
          this.vy = JUMP_SPEED;
          action = "跳跃 vy=7.5 (未飞行)";
        } else {
          action = `无动作(飞行=${this.flying} 地面=${this.onGround})`;
        }
      } else if (this.mode === "walk" && this.onGround) {
        this.vy = JUMP_SPEED;
        action = "跳跃 vy=7.5";
      } else {
        action = `无动作(模式=${this.mode} 地面=${this.onGround})`;
      }
      this.spaceLog.unshift(
        `SPACE#${this.spaceSeq++} ${ev.repeat ? "repeat" : "单按"} ` +
          `模式=${this.mode} 飞行=${this.flying} 地面=${this.onGround} vy=${this.vy.toFixed(2)} ` +
          `feet=${feet.toFixed(4)} 顶=${Number.isFinite(top) ? top.toFixed(4) : "无"} ` +
          `差=${Number.isFinite(top) ? (feet - top).toFixed(4) : "-"} → ${action}`,
      );
      if (this.spaceLog.length > 10) this.spaceLog.pop();
    }
  }

  /** 切换游戏模式 (MC F3+F4 菜单调用) */
  setMode(mode: MoveMode): void {
    this.mode = mode;
    this.flying = false;
    this.vy = 0;
    this.onGround = false;
  }

  private sweepX(vx: number, feetY: number, z: number): number {
    if (vx === 0) return this.position.x;
    let nx = this.position.x + vx;
    this.world?.forEach((bx, by, bz) => {
      if (
        feetY + BODY_HEIGHT > by + 1e-7 &&
        feetY + 1e-7 < by + 1 &&
        z + HALF_WIDTH > bz &&
        z - HALF_WIDTH < bz + 1
      ) {
        if (vx > 0) {
          if (this.position.x + HALF_WIDTH <= bx) {
            const f = bx - HALF_WIDTH - EPS;
            if (f < nx) {
              nx = f;
              this.logWall("X+", bx, by, feetY);
              this.logWallH("X+", bx, by, bz, this.position.x, f, feetY);
            }
          }
        } else {
          if (this.position.x - HALF_WIDTH >= bx + 1) {
            const f = bx + 1 + HALF_WIDTH + EPS;
            if (f > nx) {
              nx = f;
              this.logWall("X-", bx, by, feetY);
              this.logWallH("X-", bx, by, bz, this.position.x, f, feetY);
            }
          }
        }
      }
    });
    return nx;
  }

  private sweepZ(vz: number, feetY: number, x: number): number {
    if (vz === 0) return this.position.z;
    let nz = this.position.z + vz;
    this.world?.forEach((bx, by, bz) => {
      if (
        feetY + BODY_HEIGHT > by + 1e-7 &&
        feetY + 1e-7 < by + 1 &&
        x + HALF_WIDTH > bx &&
        x - HALF_WIDTH < bx + 1
      ) {
        if (vz > 0) {
          if (this.position.z + HALF_WIDTH <= bz) {
            const f = bz - HALF_WIDTH - EPS;
            if (f < nz) {
              nz = f;
              this.logWall("Z+", bx, by, feetY);
              this.logWallH("Z+", bx, by, bz, this.position.z, f, feetY);
            }
          }
        } else {
          if (this.position.z - HALF_WIDTH >= bz + 1) {
            const f = bz + 1 + HALF_WIDTH + EPS;
            if (f > nz) {
              nz = f;
              this.logWall("Z-", bx, by, feetY);
              this.logWallH("Z-", bx, by, bz, this.position.z, f, feetY);
            }
          }
        }
      }
    });
    return nz;
  }

  /** 记录水平碰撞被挡事件: 仅当脚底与方块顶面残差 <1e-6 (疑似浮点空气墙), 限频 200ms */
  private logWall(dir: string, bx: number, by: number, feetY: number): void {
    const residual = by + 1 - feetY;
    if (residual >= 1e-6) return;
    const now = performance.now();
    if (now - this.lastWallLog < 200) return;
    this.lastWallLog = now;
    this.wallLog.unshift(
      `WALL#${this.wallSeq++} ${dir} 方块(bx=${bx},by=${by}) 残差=${residual.toExponential(2)} 被挡`,
    );
    if (this.wallLog.length > 10) this.wallLog.pop();
  }

  /** 水平碰撞被挡事件日志 (每次 clamp 都记录, 用于诊断贴墙抖动): 方向/方块/起点->结果/残差 */
  private logWallH(dir: string, bx: number, by: number, bz: number, from: number, to: number, feetY: number): void {
    const now = performance.now();
    if (now - this.lastWallhLog < 200) return; // 限频 200ms 防刷屏
    this.lastWallhLog = now;
    this.wallhLog.unshift(
      `WALLH#${this.wallhSeq++} ${dir} 方块(bx=${bx},by=${by},bz=${bz}) ` +
        `feet=${feetY.toFixed(4)} ${from.toFixed(4)}->${to.toFixed(4)} ` +
        `残差=${(by + 1 - feetY).toExponential(2)}`,
    );
    if (this.wallhLog.length > 10) this.wallhLog.pop();

    // 逐帧振荡诊断: 首次 clamp 触发 burst (60 帧精确轨迹), 带 2s 冷却防连续刷屏
    const now2 = performance.now();
    if (!this.burstActive && now2 >= this.burstCooldownUntil) {
      this.burstActive = true;
      this.burstFrames = 0;
      this.burstTrigger = `${dir} 方块(${bx},${by},${bz}) ${from.toFixed(6)}->${to.toFixed(6)}`;
    }
  }

  /** 纯碰撞计算: 竖直移动 vyDelta 后 clamp 到的 feet 位置 (不碰 vy/onGround 状态) */
  private sweepYClamp(vyDelta: number): { feet: number; collided: boolean } {
    const x = this.position.x;
    const z = this.position.z;
    const feet = this.position.y - EYE_HEIGHT;
    let newFeet = feet + vyDelta;
    let collided = false;
    this.world?.forEach((bx, by, bz) => {
      if (
        x + HALF_WIDTH > bx &&
        x - HALF_WIDTH < bx + 1 &&
        z + HALF_WIDTH > bz &&
        z - HALF_WIDTH < bz + 1
      ) {
        if (vyDelta > 0) {
          if (feet + BODY_HEIGHT <= by + 1e-7) {
            const f = by - BODY_HEIGHT;
            if (f < newFeet) {
              newFeet = f;
              collided = true;
            }
          }
        } else if (vyDelta < 0) {
          if (feet + 1e-7 >= by + 1) {
            const f = by + 1;
            if (f > newFeet) {
              newFeet = f;
              collided = true;
            }
          }
        }
      }
    });
    return { feet: newFeet, collided };
  }

  private sweepY(vyDelta: number): void {
    const res = this.sweepYClamp(vyDelta);
    this.position.y = res.feet + EYE_HEIGHT;
    if (res.collided) {
      this.vy = 0;
      this.onGround = vyDelta < 0;
    } else if (vyDelta !== 0) {
      this.onGround = false;
    }
  }

  /** 固定步长物理: 只收固定 dt (与帧时序解耦, MC 式固定 tps), lock 时才推进 */
  stepPhysics(dt: number): void {
    this.prevPosition.copy(this.position);
    if (!this.locked) return;
    if (this.mode === "fly") {
      if (this.flying) this.updateFly(dt);
      else this.updateWalk(dt);
    } else if (this.mode === "spectator") this.updateSpectator(dt);
    else this.updateWalk(dt);

    // 逐帧振荡诊断: burst 激活期间每步记录位置, 攒满后标记结束 (保留完整轨迹供 main.ts 转发)
    if (this.burstActive) {
      this.burstFrames++;
      this.burstLog.push(
        `BURST#${this.burstSeq} F=${this.burstFrames} dt=${dt.toFixed(4)} ` +
          `mmX=${this.mmAccumX.toFixed(1)} mmY=${this.mmAccumY.toFixed(1)} ` +
          `yaw=${this.yaw.toFixed(6)} pitch=${this.pitch.toFixed(6)} ` +
          `x=${this.position.x.toFixed(6)} y=${this.position.y.toFixed(6)} z=${this.position.z.toFixed(6)}`,
      );
      this.mmAccumX = 0;
      this.mmAccumY = 0;
      if (this.burstFrames >= 60) {
        this.burstActive = false;
        this.burstLog.push(`BURST#${this.burstSeq} 结束 触发:${this.burstTrigger}`);
        this.burstSeq++;
        this.burstCooldownUntil = performance.now() + 2000;
      }
    }
    if (this.burstLog.length > 150) this.burstLog.shift();
  }

  /** 渲染同步: 相机位置在上一物理态与当前物理态间插值, 帧时序不均时移动依然平滑 */
  syncCamera(alpha: number): void {
    this.camera.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
  }

  /** 创造模式飞行: 有碰撞箱, 无重力 */
  private updateFly(delta: number): void {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (this.keys.has("KeyW")) move.add(forward);
    if (this.keys.has("KeyS")) move.sub(forward);
    if (this.keys.has("KeyD")) move.add(right);
    if (this.keys.has("KeyA")) move.sub(right);
    let dx = move.x;
    let dz = move.z;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      const s = (FLY_SPEED * delta) / len;
      dx *= s;
      dz *= s;
    }
    const feet = this.position.y - EYE_HEIGHT;
    this.position.x = this.sweepX(dx, feet, this.position.z);
    this.position.z = this.sweepZ(dz, feet, this.position.x);

    let dy = 0;
    if (this.keys.has("Space")) dy += FLY_SPEED * delta;
    if (this.keys.has("ControlLeft") || this.keys.has("ControlRight")) {
      dy -= FLY_SPEED * delta;
    }
    if (dy !== 0) {
      const res = this.sweepYClamp(dy);
      this.position.y = res.feet + EYE_HEIGHT;
    }
  }

  /** 观察者模式: 无碰撞箱, 穿墙穿地, 无重力 */
  private updateSpectator(delta: number): void {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (this.keys.has("KeyW")) move.add(forward);
    if (this.keys.has("KeyS")) move.sub(forward);
    if (this.keys.has("KeyD")) move.add(right);
    if (this.keys.has("KeyA")) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(FLY_SPEED * delta);
      this.position.add(move);
    }
    if (this.keys.has("Space")) this.position.y += FLY_SPEED * delta;
    if (this.keys.has("ControlLeft") || this.keys.has("ControlRight")) {
      this.position.y -= FLY_SPEED * delta;
    }
  }

  private updateWalk(delta: number): void {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let mx = 0;
    let mz = 0;
    if (this.keys.has("KeyW")) {
      mx += forward.x;
      mz += forward.z;
    }
    if (this.keys.has("KeyS")) {
      mx -= forward.x;
      mz -= forward.z;
    }
    if (this.keys.has("KeyD")) {
      mx += right.x;
      mz += right.z;
    }
    if (this.keys.has("KeyA")) {
      mx -= right.x;
      mz -= right.z;
    }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      const s = (WALK_SPEED * delta) / len;
      mx *= s;
      mz *= s;
    }

    const feet = this.position.y - EYE_HEIGHT;
    this.position.x = this.sweepX(mx, feet, this.position.z);
    this.position.z = this.sweepZ(mz, feet, this.position.x);

    this.vy -= GRAVITY * delta;
    this.sweepY(this.vy * delta);

    this.resolveEmbedding();
  }
}