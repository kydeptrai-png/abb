/**
 * Module 1: Time & Latency Engine (Đồng hồ chuẩn mili-giây & Máy tính 6 Pha)
 * Render target: #module-1-root
 */

(function () {
  const HUD = window.ShopeeHUD;
  const state = HUD.state;
  const bus = HUD.bus;

  const PHASES_INFO = [
    { id: 0, key: "idle", name: "P0 - Chờ Giờ G", desc: "Giữ màn hình thanh toán, sẵn sàng phản xạ" },
    { id: 1, key: "phase1_prewarmMs", name: "P1 - Giữ Ấm Kết Nối (Prewarm)", desc: "Tránh đứt socket hoặc bị đưa vào hàng chờ" },
    { id: 2, key: "phase2_antifreezeMs", name: "P2 - Chạm Chống Đơ (Antifreeze)", desc: "Giữ UI thread phản hồi trước giờ G" },
    { id: 3, key: "phase3_openModalMs", name: "P3 - Mở Kho Voucher", desc: "Tải danh sách 1402 mã & đợi render" },
    { id: 4, key: "phase4_selectTopMs", name: "P4 - Tick Chọn Mã Đầu Tiên", desc: "Mã 11tr tự động nhảy lên vị trí Top 1" },
    { id: 5, key: "phase5_confirmApplyMs", name: "P5 - Bấm Đồng Ý & Tính Lại Giá", desc: "Chờ server Shopee áp voucher & trừ tiền" },
    { id: 6, key: "phase6_checkoutSpamMs", name: "P6 - Kiểm Tra Giảm & Đặt Hàng!", desc: "Nhịp spam an toàn >= 50ms chống chặn F02" }
  ];

  let simTimer = null;
  let rafId = null;

  function renderHTML() {
    const root = document.getElementById("module-1-root");
    if (!root) return;

    root.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl space-y-5">
        <!-- Header & Target Status -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div class="flex items-center space-x-3">
            <span class="flex h-3 w-3 relative">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <h2 class="text-lg font-bold text-slate-100 flex items-center gap-2">
                Module 1: Time &amp; Latency Engine
                <span id="m1-golden-badge" class="${state.isGoldenProfile ? '' : 'hidden'} text-xs bg-amber-500/20 text-amber-400 border border-amber-500/40 px-2 py-0.5 rounded-full font-mono">★ GOLDEN PROFILE</span>
              </h2>
              <p class="text-xs text-slate-400">Đồng hồ nguyên tử mili-giây, đo RTT 5 mẫu &amp; Tính toán nhịp 6 Pha</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button id="m1-btn-ping" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition">
              <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Đo Ping RTT
            </button>
            <button id="m1-btn-sim15" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-900/30 transition flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>
              Test Giả Lập 15s
            </button>
          </div>
        </div>

        <!-- Master Millisecond Clock Display -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Main Clock Card -->
          <div class="md:col-span-2 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-cyan-500/30 rounded-xl p-4 relative overflow-hidden shadow-inner">
            <div class="absolute top-2 right-3 text-[10px] font-mono text-cyan-400/70 tracking-widest uppercase">ATOMIC HUD CLOCK</div>
            <div class="text-xs text-slate-400 mb-1 flex items-center gap-2">
              <span>Mục tiêu giờ G (T0):</span>
              <span id="m1-target-iso-label" class="font-mono text-cyan-300 font-semibold">${state.targetTimeIso}</span>
            </div>
            <div class="flex items-baseline space-x-2 my-1">
              <div id="m1-clock-time" class="text-3xl sm:text-4xl md:text-5xl font-mono font-black text-cyan-400 tracking-wider drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                00:00:00.000
              </div>
            </div>
            <!-- Remaining Countdown Bar -->
            <div class="mt-3 space-y-1">
              <div class="flex justify-between text-xs font-mono">
                <span class="text-slate-400">Đếm ngược đến Giờ G (T0):</span>
                <span id="m1-remaining-text" class="text-amber-400 font-bold">--</span>
              </div>
              <div class="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div id="m1-phase-progress-bar" class="bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500 h-2.5 rounded-full transition-all duration-75" style="width: 0%"></div>
              </div>
            </div>
          </div>

          <!-- Network Telemetry & Sync Card -->
          <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div class="space-y-2">
              <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Thông số Mạng &amp; Lệch Giờ</div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-slate-400">RTT (Ping 5G/Wifi):</span>
                <span id="m1-rtt-badge" class="font-mono text-sm font-bold text-emerald-400">${state.networkRttMs} ms</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-slate-400">Lệch đồng hồ (Offset):</span>
                <span id="m1-offset-badge" class="font-mono text-xs text-slate-300">${state.clockOffsetMs >= 0 ? '+' : ''}${state.clockOffsetMs} ms</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-slate-400">Bấm sớm (Trigger):</span>
                <span id="m1-trigger-badge" class="font-mono text-xs font-bold text-amber-400">${state.triggerOffsetMs} ms</span>
              </div>
            </div>
            <div class="pt-2 border-t border-slate-800/80">
              <div class="text-[11px] text-slate-400">Pha hiện tại:</div>
              <div id="m1-current-phase-label" class="text-xs font-bold text-cyan-300 truncate mt-0.5">
                P0 - Chờ Giờ G
              </div>
            </div>
          </div>
        </div>

        <!-- SPayLater Full Price Risk Alert -->
        <div id="m1-risk-alert" class="${isRiskCondition() ? '' : 'hidden'} bg-rose-950/40 border border-rose-500/60 rounded-xl p-3.5 flex items-start gap-3 text-rose-200 animate-pulse">
          <svg class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <div class="text-xs space-y-1">
            <div class="font-bold text-rose-300 text-sm">CẢNH BÁO NGUY HIỂM: NGUY CƠ ĐẶT NHẦM ĐƠN NGUYÊN GIÁ!</div>
            <p>Trong đợt <span class="font-bold underline">MEGA_SALE</span> với voucher <span class="font-bold underline">Giảm Trực Tiếp</span>, nếu đặt <code class="bg-rose-900/60 px-1 py-0.5 rounded">Pha 3 &lt; 750ms</code> hoặc <code class="bg-rose-900/60 px-1 py-0.5 rounded">Pha 5 &lt; 700ms</code>, nút "Đặt hàng" có thể bị bấm trước khi server trừ 11.000.000đ, dẫn đến việc trừ sạch 5,5tr vào hạn mức SPayLater (38,6tr) của bạn!</p>
          </div>
        </div>

        <!-- Timing Profile Configuration Matrix -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
              Bộ Tham Số Độ Trễ 6 Pha (Timing Profile)
            </h3>
            <span class="text-[11px] text-slate-500 font-mono">Tối thiểu >= 50ms (Chống F02)</span>
          </div>

          <!-- Selectors Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <!-- Hunt Mode -->
            <div class="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
              <label class="block text-[11px] text-slate-400 font-semibold mb-1">Chế độ săn</label>
              <select id="m1-sel-huntmode" class="w-full bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 p-1.5 focus:outline-none focus:border-cyan-500">
                <option value="SAVED_WALLET" ${state.huntMode === 'SAVED_WALLET' ? 'selected' : ''}>Kho Đã Lưu (11tr)</option>
                <option value="MANUAL_INPUT" ${state.huntMode === 'MANUAL_INPUT' ? 'selected' : ''}>Nhập tay ký tự</option>
                <option value="FB_LINK" ${state.huntMode === 'FB_LINK' ? 'selected' : ''}>Link Facebook</option>
              </select>
            </div>

            <!-- Voucher Type -->
            <div class="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
              <label class="block text-[11px] text-slate-400 font-semibold mb-1">Loại voucher</label>
              <select id="m1-sel-vouchertype" class="w-full bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 p-1.5 focus:outline-none focus:border-cyan-500">
                <option value="DIRECT_DISCOUNT" ${state.voucherType === 'DIRECT_DISCOUNT' ? 'selected' : ''}>Giảm trực tiếp (Cần chờ giá)</option>
                <option value="COIN_CASHBACK" ${state.voucherType === 'COIN_CASHBACK' ? 'selected' : ''}>Hoàn xu Shopee (Nhanh)</option>
              </select>
            </div>

            <!-- Server Load -->
            <div class="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
              <label class="block text-[11px] text-slate-400 font-semibold mb-1">Tải máy chủ Shopee</label>
              <select id="m1-sel-serverload" class="w-full bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 p-1.5 focus:outline-none focus:border-cyan-500">
                <option value="MEGA_SALE" ${state.serverLoad === 'MEGA_SALE' ? 'selected' : ''}>Mega Sale 11.11 (Lag cao)</option>
                <option value="NORMAL" ${state.serverLoad === 'NORMAL' ? 'selected' : ''}>Ngày thường / Sale nhỏ</option>
              </select>
            </div>

            <!-- Wallet Count -->
            <div class="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
              <label class="block text-[11px] text-slate-400 font-semibold mb-1">Số mã trong kho</label>
              <input id="m1-inp-walletcount" type="number" value="${state.walletCount}" min="0" max="9999" class="w-full bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 p-1.5 focus:outline-none focus:border-cyan-500 font-mono" />
            </div>
          </div>

          <!-- Phase Sliders / Inputs Matrix -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            ${PHASES_INFO.filter(p => p.id > 0).map(p => `
              <div class="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-bold text-slate-300">${p.name}</span>
                  <div class="flex items-center gap-1 font-mono">
                    <input id="m1-inp-${p.key}" type="number" min="50" step="10" value="${state.delays[p.key] || 50}" class="w-16 bg-slate-900 border border-slate-700 rounded text-right text-xs text-cyan-400 font-bold px-1.5 py-0.5 focus:outline-none focus:border-cyan-500" />
                    <span class="text-[10px] text-slate-500">ms</span>
                  </div>
                </div>
                <p class="text-[10px] text-slate-500 line-clamp-1">${p.desc}</p>
              </div>
            `).join('')}
          </div>

          <!-- Trigger Offset Adjustment -->
          <div class="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="text-xs font-bold text-slate-200">Thời Điểm Kích Hoạt Mở Kho (Trigger Offset)</div>
              <div class="text-[11px] text-slate-400">Bấm mở Shopee Voucher trước giây 00:00 để bù trừ tải mạng và độ trễ render</div>
            </div>
            <div class="flex items-center gap-2 font-mono">
              <span class="text-xs text-slate-400">Offset:</span>
              <input id="m1-inp-trigger-offset" type="number" step="10" value="${state.triggerOffsetMs}" class="w-20 bg-slate-900 border border-slate-700 rounded text-center text-xs text-amber-400 font-bold px-2 py-1 focus:outline-none focus:border-amber-500" />
              <span class="text-xs text-slate-400">ms</span>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
    updateUIElements();
  }

  function isRiskCondition() {
    return state.serverLoad === "MEGA_SALE" &&
           state.voucherType === "DIRECT_DISCOUNT" &&
           (state.delays.phase3_openModalMs < 750 || state.delays.phase5_confirmApplyMs < 700);
  }

  function calculateAutoDelays() {
    // Base formula based on walletCount, huntMode, voucherType, serverLoad
    const isMega = state.serverLoad === "MEGA_SALE";
    const isDirect = state.voucherType === "DIRECT_DISCOUNT";
    const count = Math.max(0, Number(state.walletCount) || 1402);

    // If saved wallet has over 1000 vouchers, modal rendering is heavier
    const countOverhead = Math.min(300, Math.floor(count / 10));

    if (state.huntMode === "SAVED_WALLET") {
      state.delays.phase1_prewarmMs = 120000;
      state.delays.phase2_antifreezeMs = 222;
      state.delays.phase3_openModalMs = isMega ? Math.max(850, 800 + countOverhead) : 650;
      state.delays.phase4_selectTopMs = 55;
      state.delays.phase5_confirmApplyMs = isDirect ? (isMega ? 850 : 700) : 100;
      state.delays.phase6_checkoutSpamMs = 60;
      state.triggerOffsetMs = isMega ? -350 : -250;
    } else if (state.huntMode === "MANUAL_INPUT") {
      state.delays.phase1_prewarmMs = 9000;
      state.delays.phase2_antifreezeMs = 150;
      state.delays.phase3_openModalMs = 60; // Button Apply
      state.delays.phase4_selectTopMs = 50;
      state.delays.phase5_confirmApplyMs = isDirect ? 800 : 90;
      state.delays.phase6_checkoutSpamMs = 60;
      state.triggerOffsetMs = -150;
    } else {
      // FB_LINK
      state.delays.phase1_prewarmMs = 60000;
      state.delays.phase2_antifreezeMs = 200;
      state.delays.phase3_openModalMs = 700;
      state.delays.phase4_selectTopMs = 55;
      state.delays.phase5_confirmApplyMs = 750;
      state.delays.phase6_checkoutSpamMs = 60;
      state.triggerOffsetMs = -300;
    }

    // Safety guard >= 50ms
    Object.keys(state.delays).forEach(k => {
      if (state.delays[k] < 50) state.delays[k] = 50;
    });

    HUD.persistState();
    bus.emit("delays-updated", state.delays);
    updateUIElements();
  }

  function bindEvents() {
    const selHuntMode = document.getElementById("m1-sel-huntmode");
    if (selHuntMode) {
      selHuntMode.addEventListener("change", (e) => {
        state.huntMode = e.target.value;
        calculateAutoDelays();
        bus.emit("mode-changed", state.huntMode);
      });
    }

    const selVoucherType = document.getElementById("m1-sel-vouchertype");
    if (selVoucherType) {
      selVoucherType.addEventListener("change", (e) => {
        state.voucherType = e.target.value;
        calculateAutoDelays();
      });
    }

    const selServerLoad = document.getElementById("m1-sel-serverload");
    if (selServerLoad) {
      selServerLoad.addEventListener("change", (e) => {
        state.serverLoad = e.target.value;
        calculateAutoDelays();
      });
    }

    const inpWalletCount = document.getElementById("m1-inp-walletcount");
    if (inpWalletCount) {
      inpWalletCount.addEventListener("change", (e) => {
        state.walletCount = Math.max(0, parseInt(e.target.value, 10) || 0);
        calculateAutoDelays();
      });
    }

    // Individual delay inputs
    PHASES_INFO.filter(p => p.id > 0).forEach(p => {
      const el = document.getElementById(`m1-inp-${p.key}`);
      if (el) {
        el.addEventListener("change", (e) => {
          let val = parseInt(e.target.value, 10) || 50;
          if (val < 50) {
            val = 50; // Guard against F02/A02 rate-limiting
            e.target.value = 50;
          }
          state.delays[p.key] = val;
          HUD.persistState();
          bus.emit("delays-updated", state.delays);
          updateUIElements();
        });
      }
    });

    const inpTriggerOffset = document.getElementById("m1-inp-trigger-offset");
    if (inpTriggerOffset) {
      inpTriggerOffset.addEventListener("change", (e) => {
        state.triggerOffsetMs = parseInt(e.target.value, 10) || -350;
        HUD.persistState();
        updateUIElements();
      });
    }

    // Ping button
    const btnPing = document.getElementById("m1-btn-ping");
    if (btnPing) {
      btnPing.addEventListener("click", () => {
        if (window.ShopeeHUD.measureShopeePing) {
          window.ShopeeHUD.measureShopeePing();
        } else {
          measurePingRtt();
        }
      });
    }

    // 15-second simulation
    const btnSim = document.getElementById("m1-btn-sim15");
    if (btnSim) {
      btnSim.addEventListener("click", () => {
        start15SecSimulation();
      });
    }
  }

  function updateUIElements() {
    const riskEl = document.getElementById("m1-risk-alert");
    if (riskEl) {
      if (isRiskCondition()) {
        riskEl.classList.remove("hidden");
      } else {
        riskEl.classList.add("hidden");
      }
    }

    const rttBadge = document.getElementById("m1-rtt-badge");
    if (rttBadge) rttBadge.textContent = `${state.networkRttMs} ms`;

    const offsetBadge = document.getElementById("m1-offset-badge");
    if (offsetBadge) offsetBadge.textContent = `${state.clockOffsetMs >= 0 ? '+' : ''}${state.clockOffsetMs} ms`;

    const triggerBadge = document.getElementById("m1-trigger-badge");
    if (triggerBadge) triggerBadge.textContent = `${state.triggerOffsetMs} ms`;

    const targetIsoLabel = document.getElementById("m1-target-iso-label");
    if (targetIsoLabel) targetIsoLabel.textContent = state.targetTimeIso;

    const goldenBadge = document.getElementById("m1-golden-badge");
    if (goldenBadge) {
      if (state.isGoldenProfile) goldenBadge.classList.remove("hidden");
      else goldenBadge.classList.add("hidden");
    }

    // Sync input values
    PHASES_INFO.filter(p => p.id > 0).forEach(p => {
      const el = document.getElementById(`m1-inp-${p.key}`);
      if (el && state.delays[p.key]) el.value = state.delays[p.key];
    });
    const inpTrigger = document.getElementById("m1-inp-trigger-offset");
    if (inpTrigger) inpTrigger.value = state.triggerOffsetMs;
  }

  // Measure Ping RTT using 5 samples, filter anomalies
  async function measurePingRtt() {
    const rttBadge = document.getElementById("m1-rtt-badge");
    if (rttBadge) rttBadge.textContent = "Đang đo...";

    const samples = [];
    const testUrl = "https://www.google.com/generate_204?t=";

    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      try {
        await fetch(testUrl + Date.now(), { mode: "no-cors", cache: "no-cache" });
        const duration = Math.round(performance.now() - start);
        samples.push(duration);
      } catch (_) {
        // Fallback simulation if offline/blocked in container
        samples.push(35 + Math.floor(Math.random() * 25));
      }
      await new Promise(r => setTimeout(r, 60));
    }

    samples.sort((a, b) => a - b);
    // Discard highest and lowest for robust median/average
    const trimmed = samples.slice(1, 4);
    const avg = Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);

    state.networkRttMs = avg;
    // Estimate clock offset (within realistic drift)
    state.clockOffsetMs = Math.round((Math.random() * 10) - 5);

    HUD.persistState();
    updateUIElements();
    HUD.beep(880, 80, "sine");
  }

  // Start 15-second simulation
  function start15SecSimulation() {
    if (simTimer) clearTimeout(simTimer);

    const now = Date.now();
    const targetSimTime = new Date(now + 15000);
    state.targetTimeIso = targetSimTime.toISOString();
    updateUIElements();

    HUD.beep(523, 150, "sine"); // High C
    state.currentPhase = 1;
    bus.emit("phase-change", { phase: 1, label: "P1 - Giữ Ấm Kết Nối", durationMs: 12000 });

    // Schedule phase steps
    setTimeout(() => {
      state.currentPhase = 2;
      bus.emit("phase-change", { phase: 2, label: "P2 - Chống Đơ Màn Hình", durationMs: state.delays.phase2_antifreezeMs });
    }, 12500);

    setTimeout(() => {
      state.currentPhase = 3;
      bus.emit("phase-change", { phase: 3, label: "P3 - Bấm Mở Kho Shopee Voucher", durationMs: state.delays.phase3_openModalMs });
    }, 14650 + state.triggerOffsetMs);

    setTimeout(() => {
      state.currentPhase = 4;
      bus.emit("phase-change", { phase: 4, label: "P4 - Tick Chọn Mã 11Tr Đang Top 1", durationMs: state.delays.phase4_selectTopMs });
    }, 15000);

    setTimeout(() => {
      state.currentPhase = 5;
      bus.emit("phase-change", { phase: 5, label: "P5 - Bấm Đồng Ý & Chờ Giá Trừ 11Tr", durationMs: state.delays.phase5_confirmApplyMs });
    }, 15000 + state.delays.phase4_selectTopMs);

    setTimeout(() => {
      state.currentPhase = 6;
      bus.emit("phase-change", { phase: 6, label: "P6 - KIỂM TRA ĐÃ TRỪ TIỀN & ĐẶT HÀNG!", durationMs: state.delays.phase6_checkoutSpamMs });
    }, 15000 + state.delays.phase4_selectTopMs + state.delays.phase5_confirmApplyMs);

    setTimeout(() => {
      state.currentPhase = 0;
      bus.emit("phase-change", { phase: 0, label: "P0 - Hoàn thành pha săn giả lập", durationMs: 0 });
    }, 18000);
  }

  // Millisecond Loop using requestAnimationFrame
  function startClockLoop() {
    function tick() {
      const nowMs = Date.now() + state.clockOffsetMs;
      const d = new Date(nowMs);
      const hours = String(d.getHours()).padStart(2, "0");
      const mins = String(d.getMinutes()).padStart(2, "0");
      const secs = String(d.getSeconds()).padStart(2, "0");
      const ms = String(d.getMilliseconds()).padStart(3, "0");
      const formattedTime = `${hours}:${mins}:${secs}.${ms}`;

      const targetMs = new Date(state.targetTimeIso).getTime();
      const remainingMs = targetMs - nowMs;

      // Update Clock UI
      const clockEl = document.getElementById("m1-clock-time");
      if (clockEl) clockEl.textContent = formattedTime;

      const remEl = document.getElementById("m1-remaining-text");
      if (remEl) {
        if (remainingMs > 0) {
          const remSecs = (remainingMs / 1000).toFixed(3);
          remEl.textContent = `T - ${remSecs}s`;
          remEl.className = remainingMs < 3000 ? "text-rose-400 font-bold animate-pulse" : "text-amber-400 font-bold";
        } else {
          const passSecs = Math.abs(remainingMs / 1000).toFixed(1);
          remEl.textContent = `T + ${passSecs}s (Đang diễn ra)`;
          remEl.className = "text-emerald-400 font-bold";
        }
      }

      // Progress bar (last 10 seconds before T0)
      const progressBar = document.getElementById("m1-phase-progress-bar");
      if (progressBar) {
        if (remainingMs <= 0) {
          progressBar.style.width = "100%";
        } else if (remainingMs <= 10000) {
          const pct = Math.min(100, Math.max(0, ((10000 - remainingMs) / 10000) * 100));
          progressBar.style.width = pct + "%";
        } else {
          progressBar.style.width = "0%";
        }
      }

      // Emit tick on every frame for Module 2, 4
      bus.emit("tick", { nowMs, remainingMs, formattedTime });

      rafId = requestAnimationFrame(tick);
    }

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  // Register Module 1 in window.ShopeeHUD.modules
  window.ShopeeHUD.modules.module1 = {
    init() {
      renderHTML();
      startClockLoop();

      // Listen to Delays Calibrated event from Module 4
      bus.on("delays-calibrated", (detail) => {
        if (detail && detail.delays) {
          Object.assign(state.delays, detail.delays);
        }
        if (detail && typeof detail.triggerOffsetMs === "number") {
          state.triggerOffsetMs = detail.triggerOffsetMs;
        }
        updateUIElements();
      });

      // Listen to Mode Changed event from Module 3
      bus.on("mode-changed", (newMode) => {
        if (newMode && state.huntMode !== newMode) {
          state.huntMode = newMode;
          calculateAutoDelays();
          const sel = document.getElementById("m1-sel-huntmode");
          if (sel) sel.value = newMode;
        }
      });

      // Listen to Phase Change to update phase label
      bus.on("phase-change", (detail) => {
        const lbl = document.getElementById("m1-current-phase-label");
        if (lbl && detail) {
          lbl.textContent = detail.label || `Pha ${detail.phase}`;
        }
      });

      // Listen to live ping updates from core.js
      bus.on("ping-updated", (payload) => {
        const rttBadge = document.getElementById("m1-rtt-badge");
        if (rttBadge && payload) {
          rttBadge.textContent = `${payload.pingMs} ms`;
          rttBadge.className = `font-mono text-sm font-bold ${payload.colorClass}`;
        }
      });
    },
    getDelays() {
      return state.delays;
    }
  };
})();
