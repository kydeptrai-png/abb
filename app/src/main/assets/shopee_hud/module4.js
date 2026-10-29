/**
 * Module 4: Execution Bridge, Back-Voucher Radar & Self-Tuning Engine
 * Kết hợp hoàn chỉnh giữa Execution Bridge (AutoStudio) và Radar Self-Tuning (ShopeeHUD)
 * Render target: #module-4-root
 */

(function () {
  const AS = window.AutoStudio || window.ShopeeHUD;
  const S = AS.state;
  const bus = AS.bus;

  const M = (AS.modules.module4 = window.ShopeeHUD.modules.module4 = AS.modules.module4 || {});

  const WS_URL = 'ws://127.0.0.1:8765';
  const PRICE_LABEL = 'Tổng thanh toán';
  const SUCCESS_TEXTS = ['Đặt hàng thành công', 'Đơn hàng đã được đặt'];
  const LOGS_STORAGE_KEY = "shopee_hud_m4_logs";

  // 5 mốc hồi mã Back-Voucher sau T0 (giây)
  const BACK_MILESTONES = [
    { label: "+01:30", offsetSec: 90, name: "Nhả hủy giỏ hàng", prob: "Rất cao" },
    { label: "+03:00", offsetSec: 180, name: "Nhả lỗi thanh toán thẻ", prob: "Cao" },
    { label: "+05:00", offsetSec: 300, name: "Hủy đơn treo SPayLater", prob: "Trung bình" },
    { label: "+10:00", offsetSec: 600, name: "Shopee quét đợt 2", prob: "Cao" },
    { label: "+15:00", offsetSec: 900, name: "Hết hạn thanh toán 15p", prob: "Rất cao" }
  ];

  const SALE_HOURS = [0, 9, 12, 15, 18, 21];

  let ws = null, seq = 0, manual = false, retryT = null, backoff = 1000;

  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const stamp = () => {
    const d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3);
  };

  const log = (tag, msg) => {
    const logEl = document.getElementById("m4-log");
    if (!logEl) return;
    logEl.textContent += '[' + stamp() + '] ' + (tag + '     ').slice(0, 5) + ' ' + msg + '\n';
    if (logEl.textContent.length > 30000) logEl.textContent = logEl.textContent.slice(-20000);
    logEl.scrollTop = logEl.scrollHeight;
  };

  const setWs = (on) => {
    const b = document.getElementById("m4-ws");
    if (b) {
      b.textContent = on ? 'Online' : 'Offline';
      b.className = 'px-2 py-0.5 rounded text-xs font-mono font-bold ' + (on ? 'bg-emerald-700 text-white' : 'bg-zinc-700 text-zinc-300');
    }
    const btn = document.getElementById("m4-conn");
    if (btn) btn.textContent = on ? 'Ngắt kết nối' : 'Kết nối WebSocket';
  };

  const setArm = () => {
    const btn = document.getElementById("m4-arm");
    if (btn) {
      btn.textContent = 'ARM: ' + (S.isArmed ? 'ON' : 'OFF');
      btn.className = `px-3 py-1.5 rounded-md border text-xs font-bold transition active:scale-95 ${S.isArmed ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-500 text-white' : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-600 text-zinc-300'}`;
    }
  };

  /* ---------- WebSocket Bridge ---------- */
  const schedule = () => {
    if (manual) return;
    clearTimeout(retryT);
    retryT = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 15000);
  };

  const connect = () => {
    if (ws && ws.readyState <= 1) return;
    manual = false;
    clearTimeout(retryT);
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      log('ERR', String(e));
      return schedule();
    }
    ws.onopen = () => {
      backoff = 1000;
      setWs(true);
      log('OPEN', WS_URL + ' (Cầu nối điều khiển tự động)');
      AS.beep?.(1046, 120);
    };
    ws.onmessage = (e) => {
      log('ACK', String(e.data).slice(0, 160));
    };
    ws.onerror = () => {
      log('ERR', 'WebSocket lỗi hoặc dịch vụ daemon chưa bật ở cổng 8765');
    };
    ws.onclose = () => {
      setWs(false);
      log('CLOSE', manual ? 'đã ngắt thủ công' : 'mất kết nối');
      schedule();
    };
  };

  const disconnect = () => {
    manual = true;
    clearTimeout(retryT);
    if (ws) ws.close();
  };

  const send = (cmd) => {
    if (!ws || ws.readyState !== 1) {
      log('DROP', cmd.op + '(' + cmd.x + ', ' + cmd.y + '): WS chưa mở');
      return false;
    }
    ws.send(JSON.stringify(cmd));
    return true;
  };

  const toCmd = (p) => {
    const R = S.screenResolution || { width: 1080, height: 2400 };
    const x = Number.isFinite(p.x) ? p.x : Math.round((p.xPct || 0) / 100 * R.width);
    const y = Number.isFinite(p.y) ? p.y : Math.round((p.yPct || 0) / 100 * R.height);
    const d = Number(p.duration || p.durationMs || 0);
    return { op: d > 0 ? 'press' : 'click', x: x, y: y, duration: d };
  };

  // Lắng nghe sự kiện dispatch-touch để chuyển tiếp qua WebSocket
  bus.on('dispatch-touch', (packet) => {
    packet = packet || {};
    if (!Number.isFinite(packet.x) && !Number.isFinite(packet.xPct)) {
      log('BAD', 'packet thiếu tọa độ');
      return;
    }
    const c = toCmd(packet);
    if (!S.isArmed) {
      log('SKIP', c.op + '(' + c.x + ', ' + c.y + '): chưa ARM');
      return;
    }
    c.id = ++seq;
    c.t = Date.now();
    if (send(c)) {
      log('SEND', '#' + c.id + ' ' + c.op + '(' + c.x + ', ' + c.y + (c.duration ? ', ' + c.duration + 'ms' : '') + ')');
    }
  });

  const fireMs = () => Date.parse(S.targetTimeIso) + (S.triggerOffsetMs || -350);

  const fmtCd = (ms) => {
    const a = Math.abs(ms);
    return (ms < 0 ? '+' : '-') + pad(Math.floor(a / 3600000)) + ':' + pad(Math.floor(a / 60000) % 60) + ':' +
      pad(Math.floor(a / 1000) % 60) + '.' + pad(a % 1000, 3);
  };

  /* ---------- AutoX.js Generator ---------- */
  const generateAndroidAutoScript = () => {
    const R = S.screenResolution || { width: 1080, height: 2400 };
    const W = R.width, H = R.height, L = S.safetyLock;
    return AUTOX_TEMPLATE({
      screen: { width: W, height: H },
      clockOffsetMs: S.clockOffsetMs,
      fireMs: fireMs(),
      steps: S.steps.map((s) => ({
        name: s.name,
        action: s.action,
        x: Math.round(s.xPct / 100 * W),
        y: Math.round(s.yPct / 100 * H),
        delay: s.delayAfterMs,
        burst: s.burstCount || 0
      })),
      retryMs: (S.retryScheduleMinutes || [1.5, 3, 5, 10, 15]).map((m) => Math.round(m * 60000)),
      maxPriceVnd: L.expectedMaxFinalPrice,
      requirePriceDropConfirm: L.requirePriceDropConfirm,
      priceLabel: PRICE_LABEL,
      success: SUCCESS_TEXTS,
      ui: L.uiRules
    });
  };

  function AUTOX_TEMPLATE(cfg) {
    return String.raw`auto.waitFor();
// Sinh bởi Module 4 lúc ${new Date().toISOString()}
// Giờ máy chủ ≈ Date.now() + clockOffsetMs. Dừng khẩn cấp: nút đỏ trên bảng nổi.
var CFG = ${JSON.stringify(cfg, null, 1)};
setScreenMetrics(CFG.screen.width, CFG.screen.height);

var FIRE = CFG.fireMs, OFF = CFG.clockOffsetMs, ST = CFG.steps, UI = CFG.ui;
var ABORT = false, STARTED = false, fw = null;

function now() { return new Date().getTime() + OFF; }
function pad(n, w) { var t = String(n); while (t.length < (w || 2)) t = '0' + t; return t; }
function fmt(ms) {
  var a = Math.abs(ms);
  return (ms < 0 ? '+' : '-') + pad(Math.floor(a / 3600000)) + ':' + pad(Math.floor(a / 60000) % 60) + ':' +
    pad(Math.floor(a / 1000) % 60) + '.' + pad(a % 1000, 3);
}
function log(m) {
  console.log(m);
  if (fw) ui.run(function () { fw.st.setText(String(m)); });
}
function jit(v) { return v + Math.round(Math.random() * 6 - 3); }
function tapAt(s) { press(jit(s.x), jit(s.y), 50 + Math.round(Math.random() * 40)); }
function sleepUntil(t) { while (!ABORT && now() < t) sleep(Math.max(1, Math.min(50, t - now()))); }
function waitUntilTrue(fn, ms) {
  var e = Date.now() + ms;
  while (!ABORT && Date.now() < e) { if (fn()) return true; sleep(100); }
  return false;
}
function has(s) { return textContains(s).exists(); }
function waitFor(s, ms) { return waitUntilTrue(function () { return has(s); }, ms); }
function waitGone(s, ms) { return waitUntilTrue(function () { return !has(s); }, ms); }
function success() {
  for (var k = 0; k < CFG.success.length; k++) if (has(CFG.success[k])) return true;
  return false;
}
function tapText(s, fallback) {
  var w = textContains(s).findOne(300);
  if (w && w.click()) return 'node';
  tapAt(fallback);
  return 'coord';
}
function textViews() {
  var list = className('android.widget.TextView').find(), out = [], i, t;
  for (i = 0; i < list.size(); i++) { t = list.get(i).text(); if (t) out.push(String(t)); }
  return out;
}
function parseVnd(t) {
  var s = String(t);
  var m = s.match(/[₫đ]\s?(\d{1,3}(?:[.,]\d{3})+|\d+)/) || s.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)\s?(?:₫|đ|VND)/i);
  return m ? parseInt(m[1].replace(/[.,]/g, ''), 10) : null;
}
function readPayable() {
  var a = textViews(), n = a.length, i, j, v;
  for (i = 0; i < n; i++) {
    if (a[i].indexOf(CFG.priceLabel) < 0) continue;
    for (j = i; j < Math.min(n, i + 4); j++) { v = parseVnd(a[j]); if (v !== null) return v; }
  }
  return null;
}
// Cầu dao: không đọc được giá, hoặc giá vượt mức tối đa thì KHÔNG bấm Đặt hàng
function breaker() {
  var p = readPayable(), max = CFG.maxPriceVnd;
  if (p === null) { log('Cầu dao: không đọc được giá, không đặt'); return false; }
  if (CFG.requirePriceDropConfirm && p > max) { log('Cầu dao: giá ' + p + ' > ' + max + ', chưa đặt'); return false; }
  log('Cầu dao: giá ' + p + ', cho phép đặt');
  return true;
}
// Một lượt: mở voucher, chọn, Đồng ý, kiểm giá, burst Đặt hàng có chốt an toàn
function attempt(anchor) {
  sleepUntil(anchor);
  if (ABORT) return 'ABORT';
  tapAt(ST[2]); sleep(ST[2].delay);
  if (!waitFor(UI.waitForModalTitle, 2500) || !waitFor(UI.targetVoucherText, 1500)) {
    log('Chưa thấy modal hoặc voucher mục tiêu, bỏ lượt'); return 'NOT_READY';
  }
  tapAt(ST[3]); sleep(ST[3].delay);
  tapText(UI.confirmButtonText, ST[4]); sleep(ST[4].delay);
  waitGone(UI.loadingIndicatorText, 4000);
  log('Toast voucher: ' + (has(UI.successToastText) ? 'có' : 'không thấy'));
  if (!waitFor(UI.submitButtonText, 2000)) { log('Chưa thấy nút Đặt hàng, bỏ lượt'); return 'NOT_READY'; }
  if (!breaker()) return 'HOLD';
  // Burst chỉ tiếp tục khi nút còn đó và không có "Đang tải", tránh đơn trùng
  for (var i = 0; i < ST[5].burst && !ABORT; i++) {
    if (!has(UI.submitButtonText) || has(UI.loadingIndicatorText)) break;
    tapAt(ST[5]); sleep(Math.max(60, ST[5].delay));
  }
  if (waitUntilTrue(success, 6000)) { log('Thành công, dừng mọi lượt thử'); return 'OK'; }
  if (!has(UI.submitButtonText)) { log('Đã rời checkout nhưng chưa thấy xác nhận, dừng. Kiểm tra Đơn hàng'); return 'LEFT'; }
  log('Chưa xác nhận, vẫn ở checkout, sẽ thử lại');
  return 'RETRY';
}
function runAll() {
  var t1 = FIRE - ST[1].delay - ST[0].delay, t2 = FIRE - ST[1].delay;
  log('Chờ pre-warm: ' + fmt(t1 - now()));
  sleepUntil(t1);
  if (!ABORT && now() - t1 < 3000) tapAt(ST[0]);
  sleepUntil(t2);
  if (!ABORT && now() - t2 < 1000) tapAt(ST[1]);
  var res = attempt(FIRE);
  for (var k = 0; k < CFG.retryMs.length && !ABORT; k++) {
    if (res === 'OK' || res === 'LEFT') break;
    log('Thử lại lần ' + (k + 1) + ' lúc +' + Math.round(CFG.retryMs[k] / 1000) + 's');
    res = attempt(FIRE + CFG.retryMs[k]);
  }
  log('Kết thúc: ' + res);
}

if (!floaty.checkPermission()) {
  floaty.requestPermission();
  toast('Cấp quyền hiển thị trên ứng dụng khác rồi chạy lại');
  exit();
}
fw = floaty.window(
  <vertical bg="#E6111111" padding="8">
    <text id="clk" text="--" textColor="#00FF88" textSize="13sp"/>
    <text id="st" text="Sẵn sàng" textColor="#FFFFFF" textSize="11sp"/>
    <button id="go" text="BẮT ĐẦU TỰ ĐỘNG" textSize="11sp"/>
    <button id="stop" text="DỪNG KHẨN CẤP" textColor="#FF5555" textSize="11sp"/>
  </vertical>
);
fw.setPosition(10, 300);
fw.go.click(function () {
  if (STARTED) return;
  STARTED = true;
  threads.start(function () { try { runAll(); } catch (e) { log('Lỗi: ' + e); } });
});
fw.stop.click(function () { ABORT = true; log('Dừng khẩn cấp, hủy mọi lượt'); });
threads.start(function () {
  while (true) {
    (function (v) { ui.run(function () { fw.clk.setText(fmt(v)); }); })(FIRE - now());
    sleep(100);
  }
});
`;
  }

  /* ---------- Self-Tuning Engine & Logs ---------- */
  function loadLogs() {
    try {
      const raw = localStorage.getItem(LOGS_STORAGE_KEY);
      if (raw) S.logs = JSON.parse(raw);
    } catch (_) {}
  }

  function saveLogs() {
    try {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(S.logs));
    } catch (_) {}
    AS.persistState?.();
    renderLogsList();
    renderHeatmap();
  }

  function applySelfTuning(optionId) {
    const timestamp = new Date().toISOString();
    const d = new Date();
    const hour = d.getHours();

    let diagName = "", actionDesc = "";

    if (optionId === 1) {
      diagName = "THÀNH CÔNG - Áp mã chuẩn";
      S.isGoldenProfile = true;
      actionDesc = "Đã lưu làm Cấu Hình Vàng (Golden Profile). Giữ nguyên các pha.";
      AS.beep?.(1200, 200);
    } else if (optionId === 2) {
      diagName = "MỞ KHO MÃ CHƯA SÁNG";
      S.triggerOffsetMs = (S.triggerOffsetMs || -350) + 70;
      actionDesc = `Bấm mở kho quá sớm. Điều chỉnh triggerOffsetMs += 70ms (Hiện tại: ${S.triggerOffsetMs}ms).`;
      AS.beep?.(700, 150);
    } else if (optionId === 3) {
      diagName = "NGUY HIỂM: BẤM QUA ĐỒNG Ý / NGUYÊN GIÁ";
      S.delays.phase3_openModalMs += 150;
      S.delays.phase5_confirmApplyMs += 180;
      actionDesc = `Server lag quá tải. Đã tăng Pha 3 (+150ms -> ${S.delays.phase3_openModalMs}ms) và Pha 5 (+180ms -> ${S.delays.phase5_confirmApplyMs}ms) để chống đặt nhầm nguyên giá SPayLater!`;
      AS.beep?.(400, 250);
    } else if (optionId === 4) {
      diagName = "MÃ SÁNG NHƯNG BÁO HẾT LƯỢT M02";
      S.delays.phase3_openModalMs = Math.max(600, S.delays.phase3_openModalMs - 50);
      S.delays.phase5_confirmApplyMs = Math.max(550, S.delays.phase5_confirmApplyMs - 50);
      actionDesc = `Thao tác chuẩn nhưng tổng độ trễ hơi chậm. Đã giảm nhẹ Pha 3 (-50ms -> ${S.delays.phase3_openModalMs}ms) và Pha 5 (-50ms -> ${S.delays.phase5_confirmApplyMs}ms), giữ an toàn >= 550ms.`;
      AS.beep?.(600, 150);
    } else if (optionId === 5) {
      diagName = "ĂN ĐƯỢC NHỜ MÃ BACK";
      actionDesc = "Khung giờ này có tỷ lệ hồi mã cao. Đã ưu tiên kích hoạt Radar Mã Back cho các khung giờ kế tiếp.";
      AS.beep?.(950, 200);
    }

    S.logs.unshift({
      id: Date.now(),
      timeIso: timestamp,
      hour: hour,
      optionId: optionId,
      diagnosis: diagName,
      action: actionDesc,
      delaysSnapshot: Object.assign({}, S.delays),
      triggerOffsetMs: S.triggerOffsetMs
    });

    if (S.logs.length > 50) S.logs.pop();
    saveLogs();

    const toast = document.getElementById("m4-tuning-toast");
    if (toast) {
      toast.classList.remove("hidden");
      toast.innerHTML = `
        <div class="font-bold text-slate-200">✓ TỰ ĐỘNG HIỆU CHỈNH: ${diagName}</div>
        <div class="text-[11px] text-cyan-300 mt-0.5">${actionDesc}</div>
      `;
      setTimeout(() => toast.classList.add("hidden"), 7000);
    }

    bus.emit("delays-calibrated", {
      delays: S.delays,
      triggerOffsetMs: S.triggerOffsetMs
    });
  }

  function updateRadarDisplay(data) {
    const grid = document.getElementById("m4-radar-grid");
    const statusEl = document.getElementById("m4-radar-status");
    if (!grid) return;

    const nowMs = data ? data.nowMs : Date.now();
    const targetMs = new Date(S.targetTimeIso).getTime();
    const elapsedMs = nowMs - targetMs;

    if (elapsedMs < 0) {
      if (statusEl) statusEl.textContent = `Chờ vượt qua T0 để kích hoạt radar (${((targetMs - nowMs) / 1000).toFixed(0)}s)`;
      grid.innerHTML = BACK_MILESTONES.map((m) => `
        <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1 opacity-70">
          <div class="flex items-center justify-between">
            <span class="font-bold text-rose-400 font-mono">${m.label}</span>
            <span class="text-[10px] text-slate-500">${m.prob}</span>
          </div>
          <div class="text-[10px] text-slate-400 font-semibold truncate">${m.name}</div>
          <div class="text-xs font-mono text-slate-500">Chờ T0...</div>
        </div>
      `).join('');
      return;
    }

    if (statusEl) statusEl.textContent = "● RADAR ĐANG BẮT MÃ BACK ●";

    grid.innerHTML = BACK_MILESTONES.map((m) => {
      const milestoneTargetMs = targetMs + (m.offsetSec * 1000);
      const diffMs = milestoneTargetMs - nowMs;
      const isPast = diffMs < 0;

      let timeLabel = "";
      let borderStyle = "border-slate-800 bg-slate-900";
      if (isPast) {
        timeLabel = `Đã qua (${Math.abs(Math.round(diffMs / 1000))}s trước)`;
        borderStyle = "border-slate-800 bg-slate-900/40 opacity-50";
      } else {
        const secs = (diffMs / 1000).toFixed(1);
        timeLabel = `Còn ${secs}s`;
        if (diffMs < 10000) {
          borderStyle = "border-rose-500 bg-rose-950/60 animate-pulse";
        } else {
          borderStyle = "border-cyan-500/50 bg-slate-900";
        }
      }

      return `
        <div class="p-2.5 rounded-lg border ${borderStyle} text-xs space-y-1.5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between">
              <span class="font-bold text-rose-400 font-mono text-sm">${m.label}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">${m.prob}</span>
            </div>
            <div class="text-[10px] text-slate-300 font-semibold truncate">${m.name}</div>
            <div class="font-mono text-xs font-bold text-amber-400 mt-1">${timeLabel}</div>
          </div>
          <button onclick="window.ShopeeHUD.modules.module4.setNewT0(${m.offsetSec})" class="w-full mt-1 px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] rounded transition active:scale-95">
            Đặt Làm T0 Mới
          </button>
        </div>
      `;
    }).join('');
  }

  function renderHeatmap() {
    const grid = document.getElementById("m4-heatmap-grid");
    if (!grid) return;

    grid.innerHTML = SALE_HOURS.map((h) => {
      const slotLogs = S.logs.filter((l) => l.hour === h);
      const total = slotLogs.length;
      const success = slotLogs.filter((l) => l.optionId === 1 || l.optionId === 5).length;
      const m02Errors = slotLogs.filter((l) => l.optionId === 4).length;

      let colorClass = "border-slate-800 bg-slate-900";
      if (total > 0) {
        const rate = success / total;
        if (rate >= 0.5) colorClass = "border-emerald-500/60 bg-emerald-950/30 text-emerald-300";
        else if (m02Errors > 0) colorClass = "border-purple-500/60 bg-purple-950/30 text-purple-300";
        else colorClass = "border-amber-500/60 bg-amber-950/30 text-amber-300";
      }

      return `
        <div class="p-2 rounded-lg border ${colorClass} text-center space-y-1">
          <div class="font-bold text-xs font-mono">${h}h:00</div>
          <div class="text-[11px] font-mono font-bold">${success}/${total}</div>
          <div class="text-[9px] text-slate-400">Thành công</div>
        </div>
      `;
    }).join('');
  }

  function renderLogsList() {
    const list = document.getElementById("m4-logs-list");
    if (!list) return;

    if (!S.logs || S.logs.length === 0) {
      list.innerHTML = `<div class="text-[11px] text-slate-500 italic p-2 bg-slate-900/40 rounded">Chưa có lịch sử lần săn nào.</div>`;
      return;
    }

    list.innerHTML = S.logs.slice(0, 15).map((l) => {
      const date = new Date(l.timeIso);
      const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      return `
        <div class="p-2 rounded bg-slate-900/80 border border-slate-800 space-y-0.5">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-bold text-slate-200">${l.diagnosis}</span>
            <span class="font-mono text-[10px] text-slate-500">${timeStr}</span>
          </div>
          <div class="text-[10px] text-slate-400">${l.action}</div>
        </div>
      `;
    }).join('');
  }

  function renderHTML() {
    const root = document.getElementById("module-4-root");
    if (!root) return;

    loadLogs();

    const BTN = 'px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 active:scale-95 transition';

    root.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl space-y-6">
        <!-- Header -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div class="flex items-center space-x-3">
            <span class="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </span>
            <div>
              <h2 class="text-lg font-bold text-slate-100 flex items-center gap-2">
                Module 4: Execution Bridge, Radar &amp; Self-Tuning
              </h2>
              <p class="text-xs text-slate-400">Cầu nối WebSocket 8765, AutoX.js Generator, Radar săn mã Back &amp; Tự hiệu chỉnh</p>
            </div>
          </div>
          <!-- JSON Export/Import -->
          <div class="flex items-center gap-2">
            <button id="m4-btn-export-json" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 rounded-lg transition active:scale-95 flex items-center gap-1">
              <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              Xuất JSON
            </button>
            <label class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 rounded-lg transition active:scale-95 flex items-center gap-1 cursor-pointer">
              <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Nhập JSON
              <input id="m4-file-import-json" type="file" accept=".json" class="hidden" />
            </label>
          </div>
        </div>

        <!-- 1. PHẦN EXECUTION BRIDGE (WEBSOCKET & AUTOX.JS) -->
        <section class="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-3">
          <header class="flex items-center justify-between">
            <h3 class="font-bold text-xs uppercase tracking-wider text-zinc-100 flex items-center gap-1.5">
              <span>⚡</span> Cầu Nối Thực Thi Lệnh (Execution Bridge)
            </h3>
            <span id="m4-ws" class="px-2 py-0.5 rounded text-xs font-mono font-bold bg-zinc-700 text-zinc-300">Offline</span>
          </header>
          <div class="flex flex-wrap gap-2">
            <button id="m4-conn" class="${BTN}">Kết nối WebSocket</button>
            <button id="m4-arm" class="${BTN}">ARM: OFF</button>
            <button id="m4-copy" class="${BTN} text-cyan-300">Copy Script AutoX.js</button>
            <button id="m4-dl" class="${BTN} text-emerald-300">Tải File .JS Về Điện Thoại</button>
          </div>
          <div class="flex items-center justify-between text-xs text-zinc-400 pt-1">
            <span>Đếm ngược tới mốc chạm (fireMs):</span>
            <span id="m4-cd" class="font-mono text-emerald-400 font-bold text-sm">--:--:--.---</span>
          </div>
          <pre id="m4-log" class="h-36 overflow-auto rounded bg-black/90 p-2 font-mono text-xs text-zinc-300 whitespace-pre-wrap border border-zinc-800"></pre>
        </section>

        <!-- 2. RADAR SĂN MÃ BACK -->
        <div class="bg-slate-950/80 border border-rose-500/40 rounded-xl p-4 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                Radar Đếm Ngược "Mã Back" (Hồi Mã Sau 00:00:00)
              </h3>
              <p class="text-[11px] text-slate-400">Các đơn huỷ thanh toán sẽ nhả mã lại vào các mốc cố định:</p>
            </div>
            <span id="m4-radar-status" class="text-xs font-mono font-bold text-cyan-400">Đang theo dõi T0...</span>
          </div>
          <div id="m4-radar-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5"></div>
        </div>

        <!-- 3. NHẬT KÝ 1-CHẠM & TỰ ĐỘNG HIỆU CHỈNH ĐỘ TRỄ -->
        <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              Nhật Ký 1-Chạm &amp; Thuật Toán Tự Hiệu Chỉnh Độ Trễ (Self-Tuning)
            </h3>
            <span class="text-[11px] text-slate-400 font-mono">Bấm 1 nút sau lượt săn</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <button id="m4-btn-diag-1" class="text-left p-3 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/50 transition active:scale-95 space-y-1">
              <div class="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <span class="text-sm">🏆</span> 1. THÀNH CÔNG - Áp mã chuẩn
              </div>
              <p class="text-[11px] text-slate-300">Áp mã 11tr thành công, giá đã trừ đúng và đặt đơn thành công.</p>
              <div class="text-[10px] text-emerald-300 font-mono">-> Giữ nguyên bộ số vàng (Golden Profile)</div>
            </button>

            <button id="m4-btn-diag-2" class="text-left p-3 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/50 transition active:scale-95 space-y-1">
              <div class="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <span class="text-sm">⏳</span> 2. MÃ CHƯA SÁNG / CHƯA ĐẨY LÊN
              </div>
              <p class="text-[11px] text-slate-300">Bấm mở kho nhưng mã 11tr vẫn mờ hoặc chưa kịp nhảy lên Top 1.</p>
              <div class="text-[10px] text-amber-300 font-mono">-> Bấm mở kho quá sớm (triggerOffset += 70ms)</div>
            </button>

            <button id="m4-btn-diag-3" class="text-left p-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/50 transition active:scale-95 space-y-1">
              <div class="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                <span class="text-sm">⚠️</span> 3. BẤM QUA ĐỒNG Ý / NGUYÊN GIÁ
              </div>
              <p class="text-[11px] text-slate-300">Server lag, bấm nút Đồng ý hoặc Đặt hàng khi chưa kịp trừ tiền 11tr.</p>
              <div class="text-[10px] text-rose-300 font-mono">-> Server lag (Pha 3 += 150ms, Pha 5 += 180ms)</div>
            </button>

            <button id="m4-btn-diag-4" class="text-left p-3 rounded-xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/50 transition active:scale-95 space-y-1">
              <div class="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                <span class="text-sm">❌</span> 4. SÁNG MÃ NHƯNG LỖI M02 HẾT LƯỢT
              </div>
              <p class="text-[11px] text-slate-300">Mã đã sáng, đã tick được nhưng bấm Đặt hàng thì báo hết lượt.</p>
              <div class="text-[10px] text-purple-300 font-mono">-> Chờ hơi chậm (Pha 3 -= 50ms, Pha 5 -= 50ms)</div>
            </button>

            <button id="m4-btn-diag-5" class="text-left p-3 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/50 transition active:scale-95 space-y-1 sm:col-span-2 lg:col-span-2">
              <div class="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <span class="text-sm">🎯</span> 5. ĂN ĐƯỢC NHỜ MÃ BACK (+1p30 / +5p / +10p)
              </div>
              <p class="text-[11px] text-slate-300">Trượt ở giây 00:00 nhưng săn thành công ở nhịp hồi mã tiếp theo.</p>
              <div class="text-[10px] text-cyan-300 font-mono">-> Ghi nhận khung giờ có tỷ lệ hồi mã cao</div>
            </button>
          </div>

          <div id="m4-tuning-toast" class="hidden p-3 rounded-lg bg-slate-900 border border-cyan-500/50 text-xs text-cyan-300 font-mono"></div>
        </div>

        <!-- 4. HEATMAP & LỊCH SỬ SĂN -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 class="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>
              Bản Đồ Nhiệt (Heatmap) 6 Khung Giờ Săn Sale
            </h3>
            <div id="m4-heatmap-grid" class="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1"></div>
          </div>

          <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-bold text-slate-200 uppercase tracking-wider">Nhật Ký Lần Săn Gần Nhất</h3>
                <button id="m4-btn-clear-logs" class="text-[10px] text-slate-500 hover:text-rose-400">Xóa nhật ký</button>
              </div>
              <div id="m4-logs-list" class="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-xs"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    bindControls();
    renderLogsList();
    renderHeatmap();
    setWs(false);
    setArm();
    log('INIT', 'Module 4 sẵn sàng, bấm Kết nối để mở ' + WS_URL);
  }

  function bindControls() {
    // WebSocket Connect
    const connBtn = document.getElementById("m4-conn");
    if (connBtn) {
      connBtn.onclick = () => { (ws && ws.readyState <= 1) ? disconnect() : connect(); };
    }

    // ARM toggle
    const armBtn = document.getElementById("m4-arm");
    if (armBtn) {
      armBtn.onclick = () => {
        S.isArmed = !S.isArmed;
        setArm();
        log('ARM', S.isArmed ? 'bật, sẽ bắn lệnh' : 'tắt, không bắn lệnh');
        const m3Arm = document.getElementById("m3-arm-status");
        if (m3Arm) {
          m3Arm.textContent = 'ARM: ' + (S.isArmed ? 'ON' : 'OFF');
          m3Arm.className = `px-2.5 py-1 rounded-full text-xs font-mono font-bold ${S.isArmed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'}`;
        }
      };
    }

    // Copy Script
    const copyBtn = document.getElementById("m4-copy");
    if (copyBtn) {
      copyBtn.onclick = () => {
        const code = generateAndroidAutoScript();
        if (!navigator.clipboard) {
          log('ERR', 'trình duyệt không hỗ trợ copy, dùng nút tải file');
          return;
        }
        navigator.clipboard.writeText(code).then(
          () => log('COPY', 'đã copy ' + code.length + ' ký tự script AutoX.js'),
          () => log('ERR', 'copy bị chặn, dùng nút tải file')
        );
      };
    }

    // Download Script
    const dlBtn = document.getElementById("m4-dl");
    if (dlBtn) {
      dlBtn.onclick = () => {
        const code = generateAndroidAutoScript();
        const name = 'macro-studio-' + Date.now() + '.js';
        const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: name });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        log('FILE', 'Đã tải: ' + name);
      };
    }

    // Diagnostic buttons
    for (let i = 1; i <= 5; i++) {
      const btn = document.getElementById(`m4-btn-diag-${i}`);
      if (btn) btn.onclick = () => applySelfTuning(i);
    }

    // Clear logs
    const btnClear = document.getElementById("m4-btn-clear-logs");
    if (btnClear) {
      btnClear.onclick = () => {
        if (confirm("Bạn có chắc muốn xóa toàn bộ nhật ký săn sale?")) {
          S.logs = [];
          saveLogs();
        }
      };
    }

    // Export JSON
    const btnExport = document.getElementById("m4-btn-export-json");
    if (btnExport) {
      btnExport.onclick = () => {
        const exportData = {
          version: "1.0",
          exportTime: new Date().toISOString(),
          state: S
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `ShopeeHUD_Config_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        AS.beep?.(880, 100);
      };
    }

    // Import JSON
    const fileImport = document.getElementById("m4-file-import-json");
    if (fileImport) {
      fileImport.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const imported = JSON.parse(ev.target.result);
              if (imported && imported.state) {
                Object.assign(S, imported.state);
                saveLogs();
                bus.emit("delays-calibrated", { delays: S.delays, triggerOffsetMs: S.triggerOffsetMs });
                bus.emit("mode-changed", S.huntMode);
                alert("Nhập cấu hình thành công!");
              }
            } catch (err) {
              alert("Lỗi đọc file JSON: " + err.message);
            }
          };
          reader.readAsText(file);
        }
      };
    }

    // Start 50ms countdown loop for fireMs
    setInterval(() => {
      const cdEl = document.getElementById("m4-cd");
      if (cdEl) {
        cdEl.textContent = fmtCd(fireMs() - (Date.now() + (S.clockOffsetMs || 0)));
      }
    }, 50);
  }

  M.connect = connect;
  M.disconnect = disconnect;
  M.send = send;
  M.generateAndroidAutoScript = generateAndroidAutoScript;

  M.setNewT0 = function (offsetSec) {
    const now = Date.now();
    const newTarget = new Date(now + offsetSec * 1000);
    S.targetTimeIso = newTarget.toISOString();
    AS.persistState?.();
    bus.emit("delays-calibrated", { delays: S.delays, triggerOffsetMs: S.triggerOffsetMs });
    AS.beep?.(1046, 150);
    alert(`Đã đặt mốc hồi mã (+${offsetSec}s) làm T0 mới!`);
  };

  M.init = function () {
    renderHTML();

    bus.on("tick", (detail) => {
      updateRadarDisplay(detail);
    });
  };
})();
