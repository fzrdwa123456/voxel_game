// NW.js 绿色版打包: nwjs 缓存 -> release\VoxelEngineNWWeb\game\core\
// (nw.exe 改名 core.exe) + vite dist + manifest, 与 launcher.exe 构成绿色目录
import { existsSync, mkdirSync, copyFileSync, cpSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(".");
const nwDist = path.join(root, "nwjs", "nwjs-v0.114.2-win-x64");
const dist = path.join(root, "dist");
const release = path.join(root, "release", "VoxelEngineNWWeb");
const core = path.join(release, "game", "core");

if (!existsSync(path.join(nwDist, "nw.exe"))) {
  console.error("nwjs 未下载, 先运行: npm run get-nw");
  process.exit(1);
}
if (!existsSync(path.join(dist, "index.html"))) {
  console.error("dist 未构建, 先运行: tsc && vite build");
  process.exit(1);
}

mkdirSync(release, { recursive: true });
if (existsSync(core)) rmSync(core, { recursive: true, force: true });
mkdirSync(core, { recursive: true });

// NW.js 全家 -> game\core\, nw.exe 改名 core.exe
cpSync(nwDist, core, { recursive: true });
renameSync(path.join(core, "nw.exe"), path.join(core, "core.exe"));

// vite dist + manifest -> game\core\ (与 core.exe 同级, NW.js 纯文件模式)
cpSync(dist, core, { recursive: true });
copyFileSync(path.join(root, "app", "package.json"), path.join(core, "package.json"));

console.log(`打包完成 -> ${release}`);
console.log("  启动: release/VoxelEngineNWWeb/launcher.exe (core.exe 自动带 --user-data-dir=game\\data)");