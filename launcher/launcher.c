// ===== VoxelEngineNWWeb 绿色启动器 (NW.js 版, 简版) =====
// 启动 game\core\core.exe (NW.js 改名) 并传 --user-data-dir 到 game\data
// (localStorage/缓存落 game\data, 绿色版可整体移动)。
// 无钩子/无管道: ESC 交给 NW.js 0.112 (#7907: keydown preventDefault 保持锁定)。
#include <windows.h>
#include <wchar.h>

static void die(const wchar_t *extra, DWORD err) {
  wchar_t msg[600];
  wsprintfW(msg, L"%s\nGetLastError = %lu", extra, err);
  MessageBoxW(NULL, msg, L"VoxelEngineNWWeb Launcher", MB_OK | MB_ICONERROR);
  ExitProcess(1);
}

int wmain(int argc, wchar_t *argv[]) {
  wchar_t self[MAX_PATH];
  if (GetModuleFileNameW(NULL, self, MAX_PATH) == 0) die(L"GetModuleFileNameW failed", GetLastError());
  wchar_t *slash = wcsrchr(self, L'\\');
  if (slash) *slash = L'\0';

  wchar_t target[MAX_PATH];
  wsprintfW(target, L"%s\\game\\core\\core.exe", self);
  if (GetFileAttributesW(target) == INVALID_FILE_ATTRIBUTES) {
    wchar_t msg[600];
    wsprintfW(msg, L"core.exe not found:\n%s", target);
    MessageBoxW(NULL, msg, L"VoxelEngineNWWeb Launcher", MB_OK | MB_ICONERROR);
    return 1;
  }

  // game\data 作为 NW.js user-data-dir (localStorage/缓存), game\logs 留渲染层日志
  wchar_t gameDir[MAX_PATH], dataDir[MAX_PATH], logDir[MAX_PATH], logPath[MAX_PATH];
  wsprintfW(gameDir, L"%s\\game", self);
  wsprintfW(dataDir, L"%s\\game\\data", self);
  wsprintfW(logDir, L"%s\\game\\logs", self);
  wsprintfW(logPath, L"%s\\game\\logs\\launcher.log", self);
  CreateDirectoryW(gameDir, NULL);
  CreateDirectoryW(dataDir, NULL);
  CreateDirectoryW(logDir, NULL);

  HANDLE hLog = CreateFileW(logPath, GENERIC_WRITE, FILE_SHARE_READ, NULL,
                            CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (hLog == INVALID_HANDLE_VALUE) die(L"cannot create launcher.log", GetLastError());

  // 命令行: core.exe --user-data-dir="<game>\data" [透传外部参数]
  wchar_t cmdline[4096];
  int pos = wsprintfW(cmdline, L"\"%s\" --user-data-dir=\"%s\"", target, dataDir);
  for (int i = 1; i < argc; i++) {
    pos += wsprintfW(cmdline + pos, L" %s", argv[i]);
  }

  STARTUPINFOW si;
  ZeroMemory(&si, sizeof(si));
  si.cb = sizeof(si);
  si.dwFlags = STARTF_USESTDHANDLES;
  si.hStdOutput = hLog;
  si.hStdError = hLog;

  PROCESS_INFORMATION pi;
  ZeroMemory(&pi, sizeof(pi));
  if (!CreateProcessW(target, cmdline, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
    CloseHandle(hLog);
    die(L"CreateProcessW failed", GetLastError());
  }

  CloseHandle(hLog);
  WaitForSingleObject(pi.hProcess, INFINITE);
  DWORD code = 0;
  GetExitCodeProcess(pi.hProcess, &code);
  CloseHandle(pi.hProcess);
  CloseHandle(pi.hThread);
  return (int)code;
}