// 原始鼠标输入独立测试: 5 秒内移动鼠标, 应看到非零 dx/dy
// 验证点: 即使焦点在终端等其他窗口也能收到 (INPUTSINK 全局捕获)
const { RawMouseListener } = require("./target/release/rawinput.node");

const m = new RawMouseListener();
console.log("listener started, running =", m.isRunning);

let polls = 0;
let framesWithMove = 0;
let totalDx = 0;
let totalDy = 0;

const timer = setInterval(() => {
  const { dx, dy } = m.pollDelta();
  polls++;
  if (dx !== 0 || dy !== 0) {
    framesWithMove++;
    totalDx += dx;
    totalDy += dy;
    if (framesWithMove <= 10) console.log(`poll ${polls}: dx=${dx} dy=${dy}`);
    else if (framesWithMove === 11) console.log("... (后续省略)");
  }
}, 16);

setTimeout(() => {
  clearInterval(timer);
  console.log(`\n结果: ${polls} 次轮询, ${framesWithMove} 次有位移, 累计 dx=${totalDx} dy=${totalDy}`);
  console.log(`诊断: WM_INPUT 总数=${m.wm_inputTotal}, GetRawInputData 失败=${m.ridFail}, 绝对坐标丢弃=${m.absoluteDropped}`);
  m.stop();
  if (framesWithMove > 0 && totalDx + Math.abs(totalDy) !== 0) {
    console.log("PASS: 原始输入工作正常");
    process.exit(0);
  } else {
    console.log("FAIL: 未捕获到任何位移");
    process.exit(1);
  }
}, 5000);
