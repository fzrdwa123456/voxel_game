import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    // data 是 Electron userData 目录, 运行时被独占锁, 监听会 EBUSY 崩溃
    watch: { ignored: ["**/data/**"] },
  },
});