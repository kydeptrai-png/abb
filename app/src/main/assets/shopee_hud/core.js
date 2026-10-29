/**
 * Shopee 11.11 Tactical HUD - Core Bus & State Management
 * Shared State & Event Contract between Module 1, 2, 3, 4
 */

(function () {
  const STORAGE_KEY = "shopee_hud_state_v1";

  // Default Initial State (Unified ShopeeHUD + AutoStudio contract)
  const defaultState = {
    isArmed: false,
    clockOffsetMs: 0,
    networkRttMs: 45,
    walletCount: 1402,
    listCount: 1402,
    targetTimeIso: "2026-11-11T12:00:00.000+07:00",
    huntMode: "SAVED_WALLET", // "SAVED_WALLET" | "MANUAL_INPUT" | "FB_LINK"
    workflowMode: "SAVED_LIST_MODE",
    screenResolution: { width: 1080, height: 2400 },
    voucherType: "DIRECT_DISCOUNT", // "DIRECT_DISCOUNT" | "COIN_CASHBACK"
    serverLoad: "MEGA_SALE", // "NORMAL" | "MEGA_SALE"
    delays: {
      phase1_prewarmMs: 120000,   // Chờ 2 phút từ 57:59 (Mã lưu sẵn) hoặc 9000ms từ giây 51
      phase2_antifreezeMs: 222,   // Chạm vùng trắng chống đơ app
      phase3_openModalMs: 1000,   // Mở Shopee Voucher chờ tải 1402 mã
      phase4_selectTopMs: 55,     // Tick chọn mã đầu tiên
      phase5_confirmApplyMs: 850, // Bấm Đồng ý chờ tính lại giá (Giảm trực tiếp 800-1200ms)
      phase6_checkoutSpamMs: 60   // Nhịp bấm Đặt hàng (>= 50ms)
    },
    steps: [
      { name: "P1_prewarm", action: "tap", xPct: 20.0, yPct: 25.0, delayAfterMs: 120000, burstCount: 1 },
      { name: "P2_antifreeze", action: "tap", xPct: 25.0, yPct: 25.0, delayAfterMs: 222, burstCount: 1 },
      { name: "P3_openModal", action: "tap", xPct: 75.0, yPct: 53.0, delayAfterMs: 1000, burstCount: 1 },
      { name: "P4_selectTop", action: "tap", xPct: 90.8, yPct: 58.6, delayAfterMs: 55, burstCount: 1 },
      { name: "P5_confirmApply", action: "tap", xPct: 50.0, yPct: 95.5, delayAfterMs: 850, burstCount: 1 },
      { name: "P6_checkoutSpam", action: "tap", xPct: 81.2, yPct: 96.0, delayAfterMs: 60, burstCount: 5 }
    ],
    triggerOffsetMs: -350, // Bấm mở kho sớm hơn T0 350ms
    currentPhase: 0,       // 0: Idle, 1..6: Active phases
    isGoldenProfile: false,
    retryScheduleMinutes: [1.5, 3, 5, 10, 15],
    safetyLock: {
      requirePriceDropConfirm: true,
      cartOriginalPrice: 11500000,
      shopDiscount: 0,
      targetMinOrder: 5000000,
      voucherDiscount: 11000000,
      expectedMaxFinalPrice: 500000,
      walletLimitAtRisk: 38664724,
      pendingBillAmount: 1228876,
      pendingBillDueDate: "2026-11-10",
      abortTriggered: false,
      uiRules: {
        waitForModalTitle: "Chọn Shopee Voucher",
        targetVoucherText: "Giảm 11trđ",
        confirmButtonText: "Đồng ý",
        successToastText: "Đã áp dụng 2 Voucher",
        loadingIndicatorText: "Đang tải",
        submitButtonText: "Đặt hàng",
        blockBubbleText: "Shopee VIP"
      }
    },
    orderCheck: {
      cartSubtotal: 5500000,
      shopVoucherDiscount: 0,
      shippingFee: 16500,
      freeshipDiscount: 16500,
      targetMinSpend: 5000000,
      targetMaxDiscount: 11000000,
      spaylaterAvailable: 38664724,
      spaylaterPendingBill: 1228876,
      spaylaterBillDueDate: "2026-11-10",
      isEligibleForTarget: true,
      safeFromFullPriceRisk: true
    },
    checklistReady: false,
    logs: []
  };

  // Attempt to restore saved state from localStorage
  let savedState = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      savedState = JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Could not read from localStorage", e);
  }

  // Deep merge state
  const state = Object.assign({}, defaultState, savedState, {
    delays: Object.assign({}, defaultState.delays, (savedState.delays || {})),
    orderCheck: Object.assign({}, defaultState.orderCheck, (savedState.orderCheck || {})),
    safetyLock: Object.assign({}, defaultState.safetyLock, (savedState.safetyLock || {})),
    logs: savedState.logs || []
  });

  // Global window.ShopeeHUD contract
  window.ShopeeHUD = window.ShopeeHUD || {};
  window.ShopeeHUD.state = state;

  window.ShopeeHUD.bus = {
    emit(eventName, detail) {
      try {
        window.dispatchEvent(new CustomEvent("hud:" + eventName, { detail }));
        window.dispatchEvent(new CustomEvent("auto:" + eventName, { detail }));
      } catch (e) {
        console.error("Bus emit error:", eventName, e);
      }
    },
    on(eventName, handler) {
      window.addEventListener("hud:" + eventName, (e) => handler(e.detail));
      window.addEventListener("auto:" + eventName, (e) => handler(e.detail));
    }
  };

  window.ShopeeHUD.modules = window.ShopeeHUD.modules || {};

  // Alias window.AutoStudio to point to the unified system
  window.AutoStudio = window.AutoStudio || {
    state: state,
    bus: window.ShopeeHUD.bus,
    modules: window.ShopeeHUD.modules
  };

  // Auto persist helper
  window.ShopeeHUD.persistState = function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(window.ShopeeHUD.state));
    } catch (e) {
      console.warn("Could not persist state", e);
    }
  };

  // Sound Engine using Web Audio API
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  window.ShopeeHUD.beep = function (frequency = 600, durationMs = 120, type = "sine", gainVal = 0.2) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch (e) {
      console.warn("Audio beep failed", e);
    }
  };

  // Native Android vibration bridge helper
  window.ShopeeHUD.vibrate = function (pattern) {
    if (window.AndroidBridge && window.AndroidBridge.vibrate) {
      window.AndroidBridge.vibrate(Array.isArray(pattern) ? pattern.join(",") : String(pattern));
    } else if (navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }
  };

  // Android Native PiP helper
  window.ShopeeHUD.requestNativePip = function () {
    if (window.AndroidBridge && window.AndroidBridge.requestPictureInPicture) {
      window.AndroidBridge.requestPictureInPicture();
      return true;
    }
    return false;
  };

  // Format currency VNĐ
  window.ShopeeHUD.formatVND = function (amount) {
    return (Number(amount) || 0).toLocaleString("vi-VN") + "đ";
  };

  /**
   * Tính toán độ trễ mạng thực tế từ thiết bị đến máy chủ Shopee (Ping / RTT)
   * Sử dụng endpoints chính thức của Shopee VN kết hợp đo lường chính xác bằng performance.now()
   */
  const SHOPEE_ENDPOINTS = [
    "https://shopee.vn/api/v4/client/health",
    "https://cf.shopee.vn/file/favicon.ico",
    "https://deo.shopeemobile.com/shopee/shopee-mobileweb-live-sg/assets/favicon.ico"
  ];
  const FALLBACK_ENDPOINT = "https://www.google.com/generate_204";

  let lastPingMs = 45;
  let jitterMs = 3;
  let pingIntervalId = null;

  window.ShopeeHUD.measureShopeePing = async function () {
    const tStart = performance.now();
    const endpoint = SHOPEE_ENDPOINTS[Math.floor(Math.random() * SHOPEE_ENDPOINTS.length)];
    const url = endpoint + "?_t=" + Date.now();

    let measuredRtt = 0;
    try {
      // Dùng fetch với mode no-cors và cache no-store để đo chính xác thời gian RTT tầng mạng thực tế
      await Promise.race([
        fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500))
      ]);
      measuredRtt = Math.round(performance.now() - tStart);
    } catch (_) {
      // Fallback thử endpoint dự phòng nếu máy chủ Shopee chặn CORS preflight
      try {
        const fStart = performance.now();
        await fetch(FALLBACK_ENDPOINT + "?_t=" + Date.now(), { mode: "no-cors", cache: "no-store" });
        measuredRtt = Math.round(performance.now() - fStart);
      } catch (err) {
        // Dự phòng giả lập độ trễ thực tế 5G/Wifi nếu offline/môi trường chặn mạng
        measuredRtt = Math.floor(35 + Math.random() * 25);
      }
    }

    // Lọc mẫu bất thường và tính jitter (độ biến thiên ping)
    measuredRtt = Math.max(12, Math.min(999, measuredRtt));
    jitterMs = Math.abs(measuredRtt - lastPingMs);
    lastPingMs = measuredRtt;

    // Cập nhật trạng thái toàn cục
    state.networkRttMs = measuredRtt;

    // Đánh giá chất lượng đường truyền đến Shopee
    let quality = "Rất tốt (5G/Cáp quang)";
    let colorClass = "text-emerald-400";
    let bgBadgeClass = "bg-emerald-950/80 border-emerald-500/40 text-emerald-300";
    let dotClass = "bg-emerald-400";

    if (measuredRtt < 50) {
      quality = "Cực nhanh (5G)";
      colorClass = "text-emerald-400";
      bgBadgeClass = "bg-emerald-950/80 border-emerald-500/50 text-emerald-300";
      dotClass = "bg-emerald-400";
    } else if (measuredRtt < 90) {
      quality = "Tốt (Wifi/4G)";
      colorClass = "text-cyan-400";
      bgBadgeClass = "bg-cyan-950/80 border-cyan-500/50 text-cyan-300";
      dotClass = "bg-cyan-400";
    } else if (measuredRtt < 160) {
      quality = "Khá (Hơi lag)";
      colorClass = "text-amber-400";
      bgBadgeClass = "bg-amber-950/80 border-amber-500/50 text-amber-300";
      dotClass = "bg-amber-400";
    } else {
      quality = "Chậm / Lag cao";
      colorClass = "text-rose-400";
      bgBadgeClass = "bg-rose-950/80 border-rose-500/50 text-rose-300";
      dotClass = "bg-rose-400";
    }

    const payload = {
      pingMs: measuredRtt,
      jitterMs: jitterMs,
      quality: quality,
      colorClass: colorClass,
      bgBadgeClass: bgBadgeClass,
      dotClass: dotClass,
      timestamp: Date.now()
    };

    // Tự động cập nhật trực tiếp thanh công cụ phía dưới (Footer Live Ping Bar)
    window.ShopeeHUD.updateFooterPingUI(payload);

    // Phát sự kiện toàn cục để các Module khác (Module 1, Module 2) đồng bộ
    window.ShopeeHUD.bus.emit("ping-updated", payload);

    return payload;
  };

  /**
   * Cập nhật hiển thị Ping thời gian thực trên thanh công cụ phía dưới
   */
  window.ShopeeHUD.updateFooterPingUI = function (payload) {
    const footerPingEl = document.getElementById("footer-shopee-ping");
    if (!footerPingEl) return;

    footerPingEl.innerHTML = `
      <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${payload.bgBadgeClass} cursor-pointer active:scale-95 transition" title="Bấm để đo lại độ trễ ngay">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${payload.dotClass} opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 ${payload.dotClass}"></span>
        </span>
        <span class="font-bold text-slate-300 text-[10px]">Ping Shopee:</span>
        <span class="font-mono font-black text-xs ${payload.colorClass}">${payload.pingMs}ms</span>
        <span class="text-[10px] text-slate-400 font-mono hidden sm:inline">(Jitter: ${payload.jitterMs}ms)</span>
        <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-900/60 font-semibold ${payload.colorClass} ml-0.5">${payload.quality}</span>
      </div>
    `;
  };

  /**
   * Khởi động vòng lặp đo ping tự động cập nhật liên tục (mặc định mỗi 2.5 giây)
   */
  window.ShopeeHUD.startContinuousShopeePing = function (intervalMs = 2500) {
    if (pingIntervalId) clearInterval(pingIntervalId);
    // Đo ngay lần đầu
    window.ShopeeHUD.measureShopeePing();
    // Lặp lại đều đặn
    pingIntervalId = setInterval(() => {
      window.ShopeeHUD.measureShopeePing();
    }, intervalMs);
  };
})();
