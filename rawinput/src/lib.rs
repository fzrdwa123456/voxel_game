// rawinput.node: 原始鼠标输入 (SDL 同款方案)
// 独立线程 + HWND_MESSAGE 隐藏窗口 + RegisterRawInputDevices(INPUTSINK)
// WM_INPUT -> RAWMOUSE.lLastX/Y (相对增量) -> AtomicI32 累加
// JS 每帧 poll_delta() 读走并清零, 天然按帧率批量消费
//
// dwFlags 不加 RIDEV_NOLEGACY: 不吞 legacy 消息, Chromium pointer lock 不受影响, 两条路并行
use napi::{Error, Result, Status};
use napi_derive::napi;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicIsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

// ===== Win32 声明 (只声明用到的) =====
const WM_CLOSE: u32 = 0x0010;
const WM_DESTROY: u32 = 0x0002;
const WM_INPUT: u32 = 0x00FF;
const RID_INPUT: u32 = 0x10000003;
const RIM_TYPEMOUSE: u32 = 0;
const MOUSE_MOVE_ABSOLUTE: u16 = 0x0001;
const RIDEV_INPUTSINK: u32 = 0x00000100;
const THREAD_PRIORITY_TIME_CRITICAL: i32 = 15;

type WndProc = unsafe extern "system" fn(isize, u32, usize, isize) -> isize;

#[repr(C)]
struct WndClassW {
  style: u32,
  lpfn_wnd_proc: Option<WndProc>,
  cb_cls_extra: i32,
  cb_wnd_extra: i32,
  h_instance: isize,
  h_icon: isize,
  h_cursor: isize,
  h_br_background: isize,
  lpsz_menu_name: *const u16,
  lpsz_class_name: *const u16,
}

#[repr(C)]
struct RawInputDevice {
  us_usage_page: u16,
  us_usage: u16,
  dw_flags: u32,
  hwnd_target: isize,
}

#[repr(C)]
struct RawInputHeader {
  dw_type: u32,
  dw_size: u32,
  h_device: isize,
  w_param: usize,
}

const RAWINPUT_HEADER_SIZE: usize = std::mem::size_of::<RawInputHeader>();

// MSDN tagRAWMOUSE x64 布局: usFlags(2)+pad(2)+usButtonFlags(2)+usButtonData(2)
//   + ulRawButtons(4) + lLastX(4) + lLastY(4) + ulExtraInformation(4) = 24
const RAWMOUSE_SIZE: usize = 24;
const OFF_L_LAST_X: usize = RAWINPUT_HEADER_SIZE + 12;

#[repr(C)]
struct Msg {
  hwnd: isize,
  message: u32,
  w_param: usize,
  l_param: isize,
  time: u32,
  pt_x: i32,
  pt_y: i32,
  _l_private: u32,
}

extern "system" {
  fn RegisterRawInputDevices(devices: *const RawInputDevice, count: u32, cb_size: u32) -> i32;
  fn GetRawInputData(
    h_raw_input: isize,
    ui_command: u32,
    p_data: *mut u8,
    pcb_size: *mut u32,
    cb_size_header: u32,
  ) -> u32;
  fn GetModuleHandleW(lp_module_name: *const u16) -> isize;
  fn RegisterClassW(lp_wc: *const WndClassW) -> u16;
  fn CreateWindowExW(
    ex_style: u32,
    class_name: *const u16,
    window_name: *const u16,
    style: u32,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    parent: isize,
    menu: isize,
    instance: isize,
    param: *mut core::ffi::c_void,
  ) -> isize;
  fn DefWindowProcW(hwnd: isize, msg: u32, w_param: usize, l_param: isize) -> isize;
  fn GetMessageW(msg: *mut Msg, hwnd: isize, min_filter: u32, max_filter: u32) -> i32;
  fn TranslateMessage(msg: *const Msg) -> i32;
  fn DispatchMessageW(msg: *const Msg) -> isize;
  fn PostQuitMessage(code: i32);
  fn PostMessageW(hwnd: isize, msg: u32, w_param: usize, l_param: isize) -> i32;
  fn GetCurrentThread() -> isize;
  fn SetThreadPriority(thread: isize, priority: i32) -> i32;
}

// ===== 全局累加器 (单实例使用; 多实例会合并计数, 游戏场景无影响) =====
static ACC_DX: AtomicI32 = AtomicI32::new(0);
static ACC_DY: AtomicI32 = AtomicI32::new(0);
static ACC_ABS_DROPPED: AtomicI32 = AtomicI32::new(0);
// 诊断: 收到的 WM_INPUT 总数 (含被过滤的绝对坐标事件)
static ACC_WM_INPUT_TOTAL: AtomicI32 = AtomicI32::new(0);
// 诊断: GetRawInputData 失败次数
static ACC_RID_FAIL: AtomicI32 = AtomicI32::new(0);

fn wide(s: &str) -> Vec<u16> {
  s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn wnd_proc(hwnd: isize, msg: u32, w_param: usize, l_param: isize) -> isize {
  if msg == WM_INPUT && l_param != 0 {
    ACC_WM_INPUT_TOTAL.fetch_add(1, Ordering::Relaxed);
    let mut size: u32 = 0;
    // 第一次调用拿需要的缓冲区大小
    if GetRawInputData(l_param, RID_INPUT, std::ptr::null_mut(), &mut size, RAWINPUT_HEADER_SIZE as u32) == u32::MAX {
      ACC_RID_FAIL.fetch_add(1, Ordering::Relaxed);
      return DefWindowProcW(hwnd, msg, w_param, l_param);
    }
    let mut buf = vec![0u8; size as usize];
    let written = GetRawInputData(l_param, RID_INPUT, buf.as_mut_ptr(), &mut size, RAWINPUT_HEADER_SIZE as u32);
    if written == u32::MAX || (written as usize) < RAWINPUT_HEADER_SIZE + RAWMOUSE_SIZE {
      ACC_RID_FAIL.fetch_add(1, Ordering::Relaxed);
      return DefWindowProcW(hwnd, msg, w_param, l_param);
    }
    let dev_type = u32::from_ne_bytes([buf[0], buf[1], buf[2], buf[3]]);
    if dev_type == RIM_TYPEMOUSE {
      let us_flags = u16::from_ne_bytes([buf[RAWINPUT_HEADER_SIZE], buf[RAWINPUT_HEADER_SIZE + 1]]);
      if us_flags & MOUSE_MOVE_ABSOLUTE == 0 {
        // 相对模式: lLastX/Y 就是增量 (标准鼠标/游戏鼠标都走这)
        let dx = i32::from_ne_bytes([
          buf[OFF_L_LAST_X],
          buf[OFF_L_LAST_X + 1],
          buf[OFF_L_LAST_X + 2],
          buf[OFF_L_LAST_X + 3],
        ]);
        let dy = i32::from_ne_bytes([
          buf[OFF_L_LAST_X + 4],
          buf[OFF_L_LAST_X + 5],
          buf[OFF_L_LAST_X + 6],
          buf[OFF_L_LAST_X + 7],
        ]);
        if dx != 0 || dy != 0 {
          ACC_DX.fetch_add(dx, Ordering::Relaxed);
          ACC_DY.fetch_add(dy, Ordering::Relaxed);
        }
      } else {
        // 绝对坐标 (平板/远程桌面): 丢弃
        ACC_ABS_DROPPED.fetch_add(1, Ordering::Relaxed);
      }
    }
    return 0;
  }
  if msg == WM_DESTROY {
    PostQuitMessage(0);
    return 0;
  }
  DefWindowProcW(hwnd, msg, w_param, l_param)
}

fn to_napi_err(s: String) -> Error {
  Error::new(Status::GenericFailure, s)
}

#[napi(object)]
pub struct MouseDelta {
  pub dx: i32,
  pub dy: i32,
}

#[napi]
pub struct RawMouseListener {
  running: Arc<AtomicBool>,
  handle: Mutex<Option<JoinHandle<()>>>,
  hwnd: AtomicIsize,
  registered: Arc<AtomicBool>,
}

#[napi]
impl RawMouseListener {
  /// 启动后台监听线程 (隐藏消息窗口 + 原始输入注册 + GetMessage 循环)
  #[napi(constructor)]
  pub fn new() -> Result<Self> {
    let running = Arc::new(AtomicBool::new(true));
    let registered = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::channel::<std::result::Result<isize, String>>();
    let running_clone = running.clone();
    let registered_clone = registered.clone();

    let handle = std::thread::spawn(move || unsafe {
      let class_name = wide("VoxelRawMouseListener");
      let h_instance = GetModuleHandleW(std::ptr::null());
      if h_instance == 0 {
        let _ = tx.send(Err("GetModuleHandleW failed".into()));
        return;
      }

      // 类已存在时 RegisterClassW 失败是正常的 (重复 start), 忽略
      let wc = WndClassW {
        style: 0,
        lpfn_wnd_proc: Some(wnd_proc),
        cb_cls_extra: 0,
        cb_wnd_extra: 0,
        h_instance,
        h_icon: 0,
        h_cursor: 0,
        h_br_background: 0,
        lpsz_menu_name: std::ptr::null(),
        lpsz_class_name: class_name.as_ptr(),
      };
      let _atom = RegisterClassW(&wc);

      // HWND_MESSAGE 父窗口 = message-only 窗口, 不可见不进任务栏
      let hwnd = CreateWindowExW(
        0,
        class_name.as_ptr(),
        std::ptr::null(),
        0,
        0,
        0,
        0,
        0,
        -3, // HWND_MESSAGE
        0,
        h_instance,
        std::ptr::null_mut(),
      );
      if hwnd == 0 {
        let _ = tx.send(Err("CreateWindowExW failed".into()));
        return;
      }

      // 注册原始鼠标输入: INPUTSINK 让隐藏窗口在非前台也能收到全局输入
      let device = RawInputDevice {
        us_usage_page: 0x01, // Generic Desktop
        us_usage: 0x02,      // Mouse
        dw_flags: RIDEV_INPUTSINK,
        hwnd_target: hwnd,
      };
      let ok = RegisterRawInputDevices(&device, 1, std::mem::size_of::<RawInputDevice>() as u32);
      if ok == 0 {
        let _ = tx.send(Err("RegisterRawInputDevices failed".into()));
        return;
      }
      registered_clone.store(true, Ordering::SeqCst);

      SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
      let _ = tx.send(Ok(hwnd));

      // 消息循环: 阻塞等 WM_INPUT / WM_CLOSE, running=false 时由 stop 发 WM_CLOSE 唤醒退出
      let mut msg = Msg {
        hwnd: 0,
        message: 0,
        w_param: 0,
        l_param: 0,
        time: 0,
        pt_x: 0,
        pt_y: 0,
        _l_private: 0,
      };
      while running_clone.load(Ordering::SeqCst) && GetMessageW(&mut msg, 0, 0, 0) > 0 {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
      }
      // 注: 故意不 UnregisterClassW, 进程级泄漏一个类名无害且避免多实例互踩
    });

    let hwnd = rx
      .recv_timeout(Duration::from_secs(5))
      .map_err(|_| to_napi_err("rawinput thread init timeout".into()))?
      .map_err(to_napi_err)?;

    Ok(Self {
      running,
      handle: Mutex::new(Some(handle)),
      hwnd: AtomicIsize::new(hwnd),
      registered,
    })
  }

  /// 每帧调用: 取走累计增量并清零
  #[napi]
  pub fn poll_delta(&self) -> MouseDelta {
    MouseDelta {
      dx: ACC_DX.swap(0, Ordering::Relaxed),
      dy: ACC_DY.swap(0, Ordering::Relaxed),
    }
  }

  /// 绝对坐标事件丢弃计数 (诊断用, 平板/远程桌面才会非零)
  #[napi(getter)]
  pub fn absolute_dropped(&self) -> i32 {
    ACC_ABS_DROPPED.load(Ordering::Relaxed)
  }

  /// 收到的 WM_INPUT 总数 (诊断: 0 = 消息根本没送达)
  #[napi(getter)]
  pub fn wm_input_total(&self) -> i32 {
    ACC_WM_INPUT_TOTAL.load(Ordering::Relaxed)
  }

  /// GetRawInputData 失败次数 (诊断)
  #[napi(getter)]
  pub fn rid_fail(&self) -> i32 {
    ACC_RID_FAIL.load(Ordering::Relaxed)
  }

  #[napi(getter)]
  pub fn is_running(&self) -> bool {
    self.running.load(Ordering::SeqCst) && self.registered.load(Ordering::SeqCst)
  }

  /// 停止监听并回收线程
  #[napi]
  pub fn stop(&self) -> Result<()> {
    self.cleanup();
    Ok(())
  }
}

impl RawMouseListener {
  fn cleanup(&self) {
    self.running.store(false, Ordering::SeqCst);
    let hwnd = self.hwnd.swap(0, Ordering::SeqCst);
    if hwnd != 0 {
      unsafe { PostMessageW(hwnd, WM_CLOSE, 0, 0) };
    }
    if let Some(handle) = self.handle.lock().unwrap().take() {
      let _ = handle.join();
    }
  }
}

impl Drop for RawMouseListener {
  fn drop(&mut self) {
    self.cleanup();
  }
}
