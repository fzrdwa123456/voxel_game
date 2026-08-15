import grassTopUrl from "./assets/textures/block/grass_block_top.png";
import type { BlockType } from "./blocks";

export interface InvItem {
  type: BlockType;
  count: number;
}

const HOTBAR = 9;
const BAG = 27;
const TOTAL = HOTBAR + BAG;

const ICON_COLOR: Record<BlockType, string> = {
  default: "#4caf50",
  grass: `url(${grassTopUrl})`,
};

export class Inventory {
  private readonly slots: (InvItem | null)[] = new Array(TOTAL).fill(null);
  private selected = 0;
  private readonly hotbarEls: HTMLDivElement[] = [];
  private readonly bagEls: HTMLDivElement[] = [];
  private readonly panel: HTMLDivElement;
  private readonly onToggle: (open: boolean) => void;
  open = false;

  constructor(onToggle: (open: boolean) => void) {
    this.onToggle = onToggle;
    this.slots[0] = { type: "grass", count: 64 };
    this.slots[1] = { type: "default", count: 64 };

    const hotbar = document.createElement("div");
    hotbar.style.cssText =
      "position:fixed;bottom:4px;left:50%;transform:translateX(-50%);z-index:31;display:flex;gap:3px;";
    for (let i = 0; i < HOTBAR; i++) {
      const el = this.makeSlot();
      hotbar.appendChild(el);
      this.hotbarEls.push(el);
    }
    document.body.appendChild(hotbar);

    this.panel = document.createElement("div");
    this.panel.style.cssText =
      "position:fixed;inset:0;z-index:30;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;";
    const inner = document.createElement("div");
    inner.style.cssText = "background:rgba(20,20,30,.92);border:2px solid #555;border-radius:6px;padding:14px;";
    const title = document.createElement("div");
    title.style.cssText = "color:#eee;font:600 16px/1.5 sans-serif;margin-bottom:8px;text-align:center;";
    title.textContent = "背包 (点击格子放入选中物品栏槽)";
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(9,48px);gap:3px;";
    for (let i = HOTBAR; i < TOTAL; i++) {
      const el = this.makeSlot();
      grid.appendChild(el);
      this.bagEls.push(el);
    }
    inner.append(title, grid);
    this.panel.appendChild(inner);
    document.body.appendChild(this.panel);

    document.addEventListener("keydown", (ev) => {
      if (ev.repeat) return;
      if (ev.code.startsWith("Digit")) {
        const n = Number(ev.code.slice(5));
        if (n >= 1 && n <= HOTBAR) {
          this.selected = n - 1;
          this.render();
        }
      }
    });
    this.bagEls.forEach((el, i) => {
      el.addEventListener("click", () => this.swap(i + HOTBAR, this.selected));
    });

    this.render();
  }

  private makeSlot(): HTMLDivElement {
    const el = document.createElement("div");
    el.style.cssText =
      "width:48px;height:48px;background:rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.25);border-radius:4px;position:relative;display:flex;align-items:center;justify-content:center;";
    const icon = document.createElement("div");
    icon.style.cssText = "width:40px;height:40px;background-size:cover;background-position:center;";
    el.appendChild(icon);
    const count = document.createElement("div");
    count.style.cssText =
      "position:absolute;right:2px;bottom:0;color:#fff;font:600 12px/1.4 monospace;text-shadow:0 1px 1px #000;";
    el.appendChild(count);
    return el;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  close(): void {
    this.setOpen(false);
  }

  private setOpen(o: boolean): void {
    if (this.open === o) return;
    this.open = o;
    this.panel.style.display = o ? "flex" : "none";
    this.onToggle(o);
  }

  private swap(a: number, b: number): void {
    const t = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = t;
    this.render();
  }

  /** 当前选中物品栏槽位的方块类型 (空手返回 null) */
  selectedType(): BlockType | null {
    const it = this.slots[this.selected];
    return it ? it.type : null;
  }

  private render(): void {
    const draw = (el: HTMLDivElement, i: number): void => {
      const icon = el.children[0] as HTMLDivElement;
      const count = el.children[1] as HTMLDivElement;
      const it = this.slots[i];
      if (!it) {
        icon.style.background = "transparent";
        icon.style.backgroundImage = "none";
        count.textContent = "";
      } else {
        icon.style.background = ICON_COLOR[it.type];
        icon.style.backgroundImage = it.type === "grass" ? ICON_COLOR.grass : "none";
        count.textContent = it.count > 1 ? `${it.count}` : "";
      }
    };
    this.hotbarEls.forEach((el, i) => {
      draw(el, i);
      el.style.borderColor = i === this.selected ? "#fff" : "rgba(255,255,255,.25)";
      el.style.background = i === this.selected ? "rgba(255,255,255,.2)" : "rgba(0,0,0,.35)";
    });
    this.bagEls.forEach((el, i) => draw(el, i + HOTBAR));
  }
}