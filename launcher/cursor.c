#include <windows.h>
#include <stdlib.h>

// 光标居中工具: Electron 无设置系统光标 API, 渲染进程无法移动系统光标,
// 菜单/背包打开时主进程调用本程序将光标移到屏幕坐标 (x, y)
int main(int argc, char* argv[]) {
  if (argc < 3) return 1;
  return SetCursorPos(atoi(argv[1]), atoi(argv[2])) ? 0 : 1;
}