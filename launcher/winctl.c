#include <windows.h>
#include <stdlib.h>
#include <string.h>

// winctl.exe: 原生窗口控制工具。绕开 NW.js 窗口 API 对最大化窗口的不可靠行为:
// moveTo/setInnerWidth 在最大化窗口上会先还原到窗口化几何 (rcNormalPosition 小窗)
// 导致闪烁帧, 且 resizeTo/setInnerWidth 连续调用异步丢尺寸 (nwjs/nw.js#7303)。
//   winctl.exe fill          -- 找到游戏窗口, 清除 WS_MAXIMIZE 并铺满屏幕 (最大化->全屏切换用)
//   winctl.exe move x y w h  -- 移动窗口并设置客户区尺寸 (参数为逻辑像素, 内部按 DPI 换算)
//   winctl.exe topmost 0|1   -- 取消/设置窗口置顶 (kiosk 进全屏后取消 HWND_TOPMOST,
//                               恢复普通全屏 Z 序行为, 任务栏让位不受影响)
// 窗口标题固定为 manifest 的 "VoxelEngineWeb", 找不到时回退前台窗口
static HWND find_window(void) {
  HWND hwnd = FindWindowW(NULL, L"VoxelEngineWeb");
  if (hwnd == NULL)
    hwnd = GetForegroundWindow();
  return hwnd;
}

static double dpi_scale(HWND hwnd) {
  UINT dpi = 96;
  typedef UINT(WINAPI* GetDpiForWindow_t)(HWND);
  GetDpiForWindow_t get_dpi = (GetDpiForWindow_t)GetProcAddress(
      GetModuleHandleW(L"user32.dll"), "GetDpiForWindow");
  if (get_dpi != NULL) {
    UINT v = get_dpi(hwnd);
    if (v != 0)
      dpi = v;
  } else {
    HDC dc = GetDC(hwnd);
    if (dc != NULL) {
      dpi = GetDeviceCaps(dc, LOGPIXELSX);
      ReleaseDC(hwnd, dc);
    }
  }
  return dpi / 96.0;
}

// 客户区尺寸 -> 窗口外框尺寸 (SetWindowPos 的 cx/cy 是外框; 用实测差最可靠)
static void client_to_outer(HWND hwnd, int* w, int* h) {
  RECT win_rect, client_rect;
  GetWindowRect(hwnd, &win_rect);
  GetClientRect(hwnd, &client_rect);
  *w += (win_rect.right - win_rect.left) - client_rect.right;
  *h += (win_rect.bottom - win_rect.top) - client_rect.bottom;
}

static int do_fill(HWND hwnd) {
  // 清除 WS_MAXIMIZE 后窗口回落到 rcNormalPosition, 立即 SetWindowPos 铺满;
  // 两步同步完成, 中间无重绘间隙 (比 Chromium 异步 restore 确定)
  LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
  SetWindowLongPtrW(hwnd, GWL_STYLE, style & ~WS_MAXIMIZE);
  int w = GetSystemMetrics(SM_CXSCREEN);
  int h = GetSystemMetrics(SM_CYSCREEN);
  return SetWindowPos(hwnd, NULL, 0, 0, w, h,
                      SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED)
             ? 0
             : 1;
}

static int do_move(HWND hwnd, int x, int y, int w, int h) {
  double scale = dpi_scale(hwnd);
  client_to_outer(hwnd, &w, &h);
  return SetWindowPos(hwnd, NULL, (int)(x * scale), (int)(y * scale),
                      (int)(w * scale), (int)(h * scale),
                      SWP_NOZORDER | SWP_NOACTIVATE)
             ? 0
             : 1;
}

static int do_topmost(HWND hwnd, int on) {
  return SetWindowPos(hwnd, on ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0,
                      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
             ? 0
             : 1;
}

int main(int argc, char* argv[]) {
  if (argc < 2)
    return 1;
  HWND hwnd = find_window();
  if (hwnd == NULL)
    return 1;
  if (strcmp(argv[1], "fill") == 0)
    return do_fill(hwnd);
  if (strcmp(argv[1], "move") == 0 && argc >= 6)
    return do_move(hwnd, atoi(argv[2]), atoi(argv[3]), atoi(argv[4]),
                   atoi(argv[5]));
  if (strcmp(argv[1], "topmost") == 0 && argc >= 3)
    return do_topmost(hwnd, atoi(argv[2]));
  return 1;
}
