/**
 * Module 2: Visual Coordinate Trainer & PiP Floating HUD
 * Render target: #module-2-root
 */

(function () {
  const HUD = window.ShopeeHUD;
  const state = HUD.state;
  const bus = HUD.bus;

  // Coordinate specifications
  const COORDS = {
    SAVED_WALLET: [
      { id: 1, name: "P1: Chờ 2p", x: 20.0, y: 25.0, delayKey: "phase1_prewarmMs", desc: "Vùng trống giữ ấm kết nối từ 57:59" },
      { id: 2, name: "P2: Chống đơ", x: 25.0, y: 25.0, delayKey: "phase2_antifreezeMs", desc: "Chạm nhẹ chống đông cứng app" },
      { id: 3, name: "P3: Shopee Voucher", x: 75.0, y: 53.0, delayKey: "phase3_openModalMs", desc: "Bấm mở danh sách 1402 mã" },
      { id: 4, name: "P4: Chọn Top 1", x: 90.8, y: 58.6, delayKey: "phase4_selectTopMs", desc: "Tick ô tròn mã 11tr nhảy lên đầu" },
      { id: 5, name: "P5: Đồng ý", x: 50.0, y: 95.5, delayKey: "phase5_confirmApplyMs", desc: "Nút cam Đồng ý chờ trừ 11 triệu" },
      { id: 6, name: "P6: Đặt hàng", x: 81.2, y: 96.0, delayKey: "phase6_checkoutSpamMs", desc: "Nút cam Đặt hàng (kiểm tra trừ giá)" }
    ],
    MANUAL_INPUT: [
      { id: 1, name: "P1: Chờ 9s", x: 20.0, y: 25.0, delayKey: "phase1_prewarmMs", desc: "Chờ từ giây 51" },
      { id: 2, name: "P2: Áp dụng", x: 85.8, y: 16.2, delayKey: "phase3_openModalMs", desc: "Bấm nút Áp dụng cạnh ô nhập mã" },
      { id: 3, name: "P3: Áp dụng 2", x: 85.8, y: 16.2, delayKey: "phase4_selectTopMs", desc: "Xác nhận áp mã ký tự" },
      { id: 4, name: "P4: Đồng ý", x: 50.0, y: 95.5, delayKey: "phase5_confirmApplyMs", desc: "Nút cam Đồng ý áp mã" },
      { id: 5, name: "P5: Đặt hàng", x: 81.2, y: 96.0, delayKey: "phase6_checkoutSpamMs", desc: "Nút cam Đặt hàng" }
    ],
    FB_LINK: [
      { id: 1, name: "P1: Mở link", x: 50.0, y: 20.0, delayKey: "phase1_prewarmMs", desc: "Mở app từ link FB" },
      { id: 2, name: "P2: Mua ngay", x: 80.0, y: 95.0, delayKey: "phase3_openModalMs", desc: "Vào thẳng màn hình đặt hàng" },
      { id: 3, name: "P3: Đặt hàng", x: 81.2, y: 96.0, delayKey: "phase6_checkoutSpamMs", desc: "Áp mã 25% tối đa 200k" }
    ]
  };

  let pipVideo = null;
  let pipCanvas = null;
  let pipCtx = null;
  let isTrainingActive = false;
  let trainingStepIndex = 0;
  let trainingStepStartTime = 0;
  let reactionErrors = [];

  function renderHTML() {
    const root = document.getElementById("module-2-root");
    if (!root) return;

    root.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl space-y-5">
        <!-- Header -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div class="flex items-center space-x-3">
            <span class="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </span>
            <div>
              <h2 class="text-lg font-bold text-slate-100 flex items-center gap-2">
                Module 2: Visual Coordinate Trainer &amp; PiP Floating HUD
              </h2>
              <p class="text-xs text-slate-400">Cửa sổ nổi PiP đè lên màn hình điện thoại &amp; Bản đồ 6 điểm thao tác chuẩn</p>
            </div>
          </div>
          <!-- PiP Action Buttons -->
          <div class="flex items-center gap-2">
            <button id="m2-btn-native-pip" class="px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-cyan-900/30 flex items-center gap-1.5 transition active:scale-95">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
              Cửa Sổ Nổi Nền (Android PiP)
            </button>
            <button id="m2-btn-web-pip" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95">
              <svg class="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              HTML5 Video PiP
            </button>
          </div>
        </div>

        <!-- PiP Canvas & Video Preview Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Canvas Stream Container -->
          <div class="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col items-center">
            <div class="w-full flex justify-between items-center text-xs text-slate-400 mb-2">
              <span class="font-mono uppercase tracking-wider text-[11px] text-indigo-400 font-semibold flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Luồng Video PiP 30FPS (420x220)
              </span>
              <span class="text-[11px] text-slate-500">Màu nền tự đổi theo Pha</span>
            </div>
            <div class="w-full max-w-[420px] aspect-[420/220] bg-black rounded-lg overflow-hidden relative shadow-2xl border border-slate-700">
              <canvas id="m2-pip-canvas" width="420" height="220" class="w-full h-full object-contain block"></canvas>
              <!-- Hidden video element that consumes the canvas stream -->
              <video id="m2-pip-video" muted playsinline class="hidden"></video>
            </div>
            <p class="text-[11px] text-slate-400 text-center mt-2">
              Khi mở ứng dụng Shopee, bật PiP sẽ đưa khung đồng hồ này nổi ở góc trên màn hình để bạn căn nhịp bấm chuẩn từng mili-giây.
            </p>
          </div>

          <!-- Sound & Cue Frequency Details -->
          <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
            <div>
              <h3 class="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
                Hệ Thống Âm Thanh Dẫn Nhịp (Web Audio API)
              </h3>
              <div class="space-y-1.5 text-xs text-slate-400">
                <div class="flex items-center justify-between p-1.5 rounded bg-slate-900/50">
                  <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-slate-400"></span> Pha 1 &amp; 2 (Chuẩn bị):</span>
                  <span class="font-mono text-cyan-300">440Hz / 520Hz (Beep nhẹ)</span>
                </div>
                <div class="flex items-center justify-between p-1.5 rounded bg-slate-900/50">
                  <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-400"></span> Pha 3 (Mở Kho Voucher):</span>
                  <span class="font-mono text-amber-300">660Hz (Cảnh báo mở)</span>
                </div>
                <div class="flex items-center justify-between p-1.5 rounded bg-slate-900/50">
                  <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400"></span> Pha 4 &amp; 5 (Tick Mã &amp; Đồng ý):</span>
                  <span class="font-mono text-emerald-300">880Hz / 1046Hz (Khớp lệnh)</span>
                </div>
                <div class="flex items-center justify-between p-1.5 rounded bg-slate-900/50">
                  <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span> Pha 6 (Kiểm tra &amp; Đặt hàng):</span>
                  <span class="font-mono text-rose-300 font-bold">1318Hz + Rung máy</span>
                </div>
              </div>
            </div>

            <!-- Reaction Trainer Metrics -->
            <div class="pt-2 border-t border-slate-800 flex items-center justify-between">
              <div>
                <div class="text-[11px] text-slate-400">Sai số phản xạ tay đo được:</div>
                <div id="m2-trainer-score-badge" class="text-sm font-mono font-bold text-amber-400">-- ms (Chưa tập)</div>
              </div>
              <button id="m2-btn-test-sound" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 rounded border border-slate-700">
                Thử Âm Thanh
              </button>
            </div>
          </div>
        </div>

        <!-- Visual Coordinate Trainer & Mobile Screen Simulator -->
        <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                Bản Đồ Tọa Độ Trực Quan &amp; Luyện Phản Xạ 6 Điểm (9:20)
              </h3>
              <p class="text-[11px] text-slate-400">Khớp chuẩn màn hình Thanh toán Shopee của điện thoại bạn</p>
            </div>
            <div class="flex items-center gap-2">
              <label class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 cursor-pointer">
                Tải Ảnh Chụp Lên
                <input id="m2-file-screenshot" type="file" accept="image/*" class="hidden" />
              </label>
              <button id="m2-btn-start-training" class="px-3 py-1 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold text-xs rounded shadow transition flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                Luyện Bấm Tay Thực Tế
              </button>
            </div>
          </div>

          <!-- Phone Mockup Canvas Wrapper -->
          <div class="flex flex-col md:flex-row gap-4 items-center justify-center">
            <!-- Simulated Phone Frame -->
            <div class="relative w-[270px] h-[600px] bg-slate-950 rounded-[36px] p-3 shadow-2xl border-4 border-slate-700 flex flex-col justify-between overflow-hidden select-none" id="m2-phone-mockup">
              <!-- Notch -->
              <div class="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-800 rounded-full z-20"></div>

              <!-- Phone Screen Surface -->
              <div id="m2-screen-surface" class="relative w-full h-full bg-slate-900 rounded-[24px] overflow-hidden border border-slate-800">
                <!-- Background Image or Simulated UI -->
                <div id="m2-screen-bg" class="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-2 text-[10px] text-slate-400 flex flex-col justify-between">
                  <!-- Header simulation -->
                  <div class="pt-6 border-b border-slate-700/50 pb-1 flex justify-between font-bold text-slate-200">
                    <span>Thanh toán Shopee</span>
                    <span class="text-orange-400">SPayLater</span>
                  </div>

                  <!-- Cart items preview -->
                  <div class="bg-slate-800/60 p-2 rounded border border-slate-700/40 my-1">
                    <div class="text-[9px] text-slate-300 font-semibold truncate">Đơn hàng mục tiêu 5.500.000đ</div>
                    <div class="text-[8px] text-slate-500">Shop Voucher: -0đ | Phí ship: 16.500đ</div>
                  </div>

                  <!-- Shopee Voucher line simulation at 53% -->
                  <div class="absolute top-[52%] left-2 right-2 p-1.5 rounded bg-orange-950/30 border border-orange-500/40 text-[9px] flex justify-between items-center text-orange-300">
                    <span class="font-bold flex items-center gap-1">
                      <span class="text-orange-400">🎟️</span> Shopee Voucher
                    </span>
                    <span class="text-orange-400 underline font-mono text-[8px]">Chọn mã &gt;</span>
                  </div>

                  <!-- Toast warning simulation zone at 89.2% -->
                  <div class="absolute top-[88%] left-4 right-4 py-1 px-2 rounded-full bg-slate-950/90 border border-amber-500/70 text-[8px] text-center text-amber-300 shadow font-mono">
                    ⚠️ Chờ Toast: "Đã áp dụng 2 voucher"
                  </div>

                  <!-- Bottom buttons simulation -->
                  <div class="absolute bottom-2 left-2 right-2 pt-2 border-t border-slate-700 flex justify-between items-center">
                    <div>
                      <div class="text-[8px] text-slate-400">Tổng thanh toán:</div>
                      <div class="text-[11px] font-bold text-orange-400 font-mono">5.500.000đ</div>
                    </div>
                    <div class="bg-orange-500 text-white font-bold text-[10px] px-3 py-1.5 rounded">
                      Đặt hàng
                    </div>
                  </div>
                </div>

                <!-- Coordinate Target Markers Layer -->
                <div id="m2-targets-layer" class="absolute inset-0 z-10 pointer-events-auto">
                  <!-- Targets generated dynamically -->
                </div>

                <!-- Training feedback overlay -->
                <div id="m2-training-overlay" class="hidden absolute inset-0 z-30 bg-black/60 flex flex-col items-center justify-center p-4 text-center">
                  <div id="m2-training-prompt" class="text-amber-300 text-sm font-bold animate-bounce mb-2">CHẠM VÀO ĐIỂM SỐ 1</div>
                  <div id="m2-training-timer" class="text-xs font-mono text-cyan-300">Chuẩn bị...</div>
                </div>
              </div>
            </div>

            <!-- Coordinate Points List with Real-time ms Labels -->
            <div class="flex-1 w-full space-y-2">
              <div class="text-xs font-bold text-slate-300 mb-1 flex items-center justify-between">
                <span>Danh Sách 6 Tọa Độ Đo Chuẩn</span>
                <span class="text-[11px] font-mono text-cyan-400" id="m2-active-mode-label">Chế độ: SAVED_WALLET</span>
              </div>
              <div id="m2-coords-list" class="space-y-1.5 text-xs">
                <!-- Rendered dynamically -->
              </div>
              <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 space-y-1 mt-2">
                <div class="font-bold text-slate-300 flex items-center gap-1">
                  <span class="text-amber-400">⚡</span> Lưu ý thực chiến của Kỹ sư #2:
                </div>
                <p>• Điểm 6 (Nút Đặt hàng ở X=81.2%, Y=96.0%) cần giữ nhịp bấm tối thiểu 50-60ms để không bị hệ thống Shopee chặn request spam (Lỗi A02/F02).</p>
                <p>• Phải đợi mắt nhìn thấy nháy trừ giá trên dòng Shopee Voucher hoặc Toast xuất hiện trước khi bấm nhịp 6 để bảo vệ hạn mức SPayLater.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    setupPiPStream();
    renderTargetsAndList();
    bindEvents();
  }

  function setupPiPStream() {
    pipCanvas = document.getElementById("m2-pip-canvas");
    pipVideo = document.getElementById("m2-pip-video");
    if (!pipCanvas || !pipVideo) return;

    pipCtx = pipCanvas.getContext("2d");

    // Capture canvas stream at 30 fps to video element
    try {
      if (pipCanvas.captureStream) {
        const stream = pipCanvas.captureStream(30);
        pipVideo.srcObject = stream;
        pipVideo.play().catch(() => {});
      }
    } catch (e) {
      console.warn("captureStream error:", e);
    }
  }

  function drawPiPCanvas(data) {
    if (!pipCtx || !pipCanvas) return;
    const ctx = pipCtx;
    const w = pipCanvas.width;
    const h = pipCanvas.height;

    const phase = state.currentPhase || 0;

    // Background color scheme based on currentPhase
    let bgGradient = ctx.createLinearGradient(0, 0, w, h);
    let borderColor = "#334155";
    let phaseText = "P0: CHỜ GIỜ G";

    if (phase === 0) {
      bgGradient.addColorStop(0, "#090d16");
      bgGradient.addColorStop(1, "#0f172a");
      borderColor = "#1e293b";
      phaseText = "P0: SẴN SÀNG";
    } else if (phase === 1) {
      bgGradient.addColorStop(0, "#082f49");
      bgGradient.addColorStop(1, "#0c4a6e");
      borderColor = "#0284c7";
      phaseText = "P1: GIỮ ẤM SOCKET (PREWARM)";
    } else if (phase === 2) {
      bgGradient.addColorStop(0, "#1e1b4b");
      bgGradient.addColorStop(1, "#312e81");
      borderColor = "#6366f1";
      phaseText = "P2: CHẠM CHỐNG ĐƠ APP";
    } else if (phase === 3) {
      // Golden Amber/Orange
      bgGradient.addColorStop(0, "#78350f");
      bgGradient.addColorStop(1, "#b45309");
      borderColor = "#f59e0b";
      phaseText = "P3: BẤM MỞ KHO SHOPEE VOUCHER!";
    } else if (phase === 4 || phase === 5) {
      // Emerald Green
      bgGradient.addColorStop(0, "#064e3b");
      bgGradient.addColorStop(1, "#047857");
      borderColor = "#10b981";
      phaseText = phase === 4 ? "P4: TICK MÃ 11TR TOP 1" : "P5: BẤM ĐỒNG Ý & CHỜ GIÁ!";
    } else if (phase === 6) {
      // Alert Red
      bgGradient.addColorStop(0, "#881337");
      bgGradient.addColorStop(1, "#be123c");
      borderColor = "#f43f5e";
      phaseText = "P6: ĐÃ TRỪ 11TR -> BẤM ĐẶT HÀNG!";
    }

    // Fill background
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, w, h);

    // Border
    ctx.lineWidth = 4;
    ctx.strokeStyle = borderColor;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Top Bar: Clock + RTT + Offset
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.fillText(`PING: ${state.networkRttMs}ms`, 14, 24);
    ctx.fillText(`TRIGGER: ${state.triggerOffsetMs}ms`, 150, 24);

    const nowStr = data ? data.formattedTime : "--:--:--.---";
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText(nowStr, w - 14, 24);
    ctx.textAlign = "left";

    // Center Countdown / Milliseconds
    ctx.fillStyle = "#f8fafc";
    ctx.font = "900 42px 'Courier New', monospace";
    const remMs = data ? data.remainingMs : 0;
    let mainLabel = "";
    if (remMs > 0) {
      mainLabel = `T - ${(remMs / 1000).toFixed(3)}s`;
    } else {
      mainLabel = `T + ${Math.abs(remMs / 1000).toFixed(2)}s`;
    }
    ctx.fillText(mainLabel, 14, 82);

    // Phase Banner with Pulsing Pill
    ctx.fillStyle = borderColor;
    ctx.beginPath();
    ctx.roundRect(14, 104, w - 28, 38, 8);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(phaseText, 24, 128);

    // Bottom telemetry bar
    const delays = state.delays;
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillText(`P3: ${delays.phase3_openModalMs}ms | P4: ${delays.phase4_selectTopMs}ms | P5: ${delays.phase5_confirmApplyMs}ms | P6: ${delays.phase6_checkoutSpamMs}ms`, 14, 172);

    // Progress line at bottom
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(14, 192, w - 28, 12);

    if (remMs <= 10000 && remMs > 0) {
      const pct = (10000 - remMs) / 10000;
      ctx.fillStyle = borderColor;
      ctx.fillRect(14, 192, (w - 28) * pct, 12);
    } else if (remMs <= 0) {
      ctx.fillStyle = "#10b981";
      ctx.fillRect(14, 192, w - 28, 12);
    }
  }

  function renderTargetsAndList() {
    const listEl = document.getElementById("m2-coords-list");
    const targetsLayer = document.getElementById("m2-targets-layer");
    const modeLabel = document.getElementById("m2-active-mode-label");
    if (!listEl || !targetsLayer) return;

    const currentCoords = COORDS[state.huntMode] || COORDS.SAVED_WALLET;
    if (modeLabel) modeLabel.textContent = `Chế độ: ${state.huntMode}`;

    // Clear targets
    targetsLayer.innerHTML = "";
    listEl.innerHTML = "";

    currentCoords.forEach((pt, index) => {
      const delayMs = state.delays[pt.delayKey] || 0;

      // Draw Marker on screen
      const marker = document.createElement("button");
      marker.className = `absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-amber-400 bg-amber-500/30 text-amber-200 font-mono font-bold text-xs flex items-center justify-center shadow-lg transition active:scale-125 hover:bg-amber-400 hover:text-black`;
      marker.style.left = `${pt.x}%`;
      marker.style.top = `${pt.y}%`;
      marker.id = `m2-marker-${pt.id}`;
      marker.innerHTML = `<span>${pt.id}</span>`;
      marker.title = `${pt.name} (${delayMs}ms)`;

      marker.addEventListener("click", () => {
        handleMarkerTap(index);
      });

      targetsLayer.appendChild(marker);

      // Add to list
      const item = document.createElement("div");
      item.className = "flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800";
      item.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-full bg-cyan-900/60 text-cyan-300 font-mono text-[11px] font-bold flex items-center justify-center border border-cyan-500/40">${pt.id}</span>
          <div>
            <span class="font-bold text-slate-200">${pt.name}</span>
            <span class="text-[10px] text-slate-500 ml-1">(${pt.x}%, ${pt.y}%)</span>
            <div class="text-[10px] text-slate-400">${pt.desc}</div>
          </div>
        </div>
        <div class="font-mono text-xs text-amber-400 font-bold">
          ${delayMs}ms
        </div>
      `;
      listEl.appendChild(item);
    });
  }

  function handleMarkerTap(index) {
    if (!isTrainingActive) {
      HUD.beep(800, 80, "sine");
      return;
    }

    if (index === trainingStepIndex) {
      const reaction = Math.round(performance.now() - trainingStepStartTime);
      reactionErrors.push(reaction);
      HUD.beep(1046, 100, "triangle");

      trainingStepIndex++;
      const currentCoords = COORDS[state.huntMode] || COORDS.SAVED_WALLET;

      if (trainingStepIndex < currentCoords.length) {
        highlightTrainingStep();
      } else {
        finishTraining();
      }
    } else {
      HUD.beep(300, 150, "sawtooth"); // Error tone
    }
  }

  function startTraining() {
    isTrainingActive = true;
    trainingStepIndex = 0;
    reactionErrors = [];
    const overlay = document.getElementById("m2-training-overlay");
    if (overlay) overlay.classList.remove("hidden");

    highlightTrainingStep();
  }

  function highlightTrainingStep() {
    const currentCoords = COORDS[state.huntMode] || COORDS.SAVED_WALLET;
    const pt = currentCoords[trainingStepIndex];
    if (!pt) return;

    trainingStepStartTime = performance.now();
    const promptEl = document.getElementById("m2-training-prompt");
    const timerEl = document.getElementById("m2-training-timer");

    if (promptEl) {
      promptEl.textContent = `BẤM ĐIỂM ${pt.id}: ${pt.name.toUpperCase()}`;
    }
    if (timerEl) {
      timerEl.textContent = `Tọa độ: X=${pt.x}%, Y=${pt.y}%`;
    }

    // Highlight marker with pulsing class
    currentCoords.forEach((p) => {
      const el = document.getElementById(`m2-marker-${p.id}`);
      if (el) {
        if (p.id === pt.id) {
          el.className = `absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-4 border-emerald-400 bg-emerald-500 text-white font-mono font-bold text-sm flex items-center justify-center shadow-[0_0_20px_#10b981] animate-ping z-30`;
        } else {
          el.className = `absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-slate-700 bg-slate-800/40 text-slate-500 font-mono text-xs flex items-center justify-center opacity-40`;
        }
      }
    });

    HUD.beep(600 + trainingStepIndex * 100, 90, "sine");
  }

  function finishTraining() {
    isTrainingActive = false;
    const overlay = document.getElementById("m2-training-overlay");
    if (overlay) overlay.classList.add("hidden");

    const avg = Math.round(reactionErrors.reduce((a, b) => a + b, 0) / (reactionErrors.length || 1));
    const badge = document.getElementById("m2-trainer-score-badge");
    if (badge) {
      badge.textContent = `${avg} ms (${avg < 180 ? 'Rất nhanh ★★★' : avg < 280 ? 'Chuẩn ★★' : 'Hơi chậm ★'})`;
    }

    bus.emit("trainer-score", { avgReactionMs: avg });
    renderTargetsAndList();
    HUD.beep(1200, 250, "sine");
  }

  function bindEvents() {
    // Native Android PiP Button
    const btnNativePip = document.getElementById("m2-btn-native-pip");
    if (btnNativePip) {
      btnNativePip.addEventListener("click", () => {
        const ok = HUD.requestNativePip();
        if (!ok) {
          alert("Android PiP: Hãy bật nút PiP từ thanh hệ thống hoặc dùng nút HTML5 Video PiP bên cạnh!");
        }
      });
    }

    // HTML5 Video PiP Button
    const btnWebPip = document.getElementById("m2-btn-web-pip");
    if (btnWebPip && pipVideo) {
      btnWebPip.addEventListener("click", async () => {
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else if (pipVideo.requestPictureInPicture) {
            await pipVideo.requestPictureInPicture();
          } else {
            alert("Trình duyệt không hỗ trợ HTML5 Picture-in-Picture. Bạn có thể dùng Native Android PiP!");
          }
        } catch (err) {
          console.warn("PiP failed:", err);
          alert("Kích hoạt PiP: Hãy chạm vào màn hình và thử lại!");
        }
      });
    }

    // Sound test button
    const btnSound = document.getElementById("m2-btn-test-sound");
    if (btnSound) {
      btnSound.addEventListener("click", () => {
        HUD.beep(440, 100, "sine");
        setTimeout(() => HUD.beep(660, 100, "sine"), 150);
        setTimeout(() => HUD.beep(880, 100, "sine"), 300);
        setTimeout(() => HUD.beep(1318, 200, "square"), 450);
        HUD.vibrate([80, 50, 120]);
      });
    }

    // Training button
    const btnTrain = document.getElementById("m2-btn-start-training");
    if (btnTrain) {
      btnTrain.addEventListener("click", () => {
        startTraining();
      });
    }

    // Image upload handler
    const fileInp = document.getElementById("m2-file-screenshot");
    if (fileInp) {
      fileInp.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const screenBg = document.getElementById("m2-screen-bg");
            if (screenBg) {
              screenBg.style.backgroundImage = `url(${ev.target.result})`;
              screenBg.style.backgroundSize = "cover";
              screenBg.style.backgroundPosition = "center";
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }
  }

  // Register Module 2
  window.ShopeeHUD.modules.module2 = {
    init() {
      renderHTML();

      // Listen to tick event from Module 1 to draw PiP canvas
      bus.on("tick", (detail) => {
        drawPiPCanvas(detail);
      });

      // Listen to Phase Change event to trigger sounds & haptics
      bus.on("phase-change", (detail) => {
        if (!detail) return;
        const p = detail.phase;

        if (p === 1) {
          HUD.beep(440, 120, "sine");
        } else if (p === 2) {
          HUD.beep(520, 120, "sine");
        } else if (p === 3) {
          HUD.beep(660, 180, "triangle");
        } else if (p === 4) {
          HUD.beep(880, 100, "sine");
        } else if (p === 5) {
          HUD.beep(1046, 150, "sine");
        } else if (p === 6) {
          HUD.beep(1318, 250, "square");
          HUD.vibrate([100, 60, 200]);
        }
      });

      // Listen to Delays Updated or Mode Changed to re-render coordinates
      bus.on("delays-updated", () => {
        renderTargetsAndList();
      });

      bus.on("mode-changed", () => {
        renderTargetsAndList();
      });
    }
  };
})();
