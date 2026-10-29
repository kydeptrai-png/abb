/**
 * Module 3: Smart Screen Rules, Circuit Breaker & 3-Layer Order Optimizer
 * Kết hợp hoàn chỉnh giữa Smart Screen Rules (AutoStudio) và Pre-Flight Optimizer (ShopeeHUD)
 * Render target: #module-3-root
 */

(function () {
  const AS = window.AutoStudio || window.ShopeeHUD;
  const S = AS.state;
  const L = S.safetyLock;
  const UI = L.uiRules;
  const bus = AS.bus;

  const M = (AS.modules.module3 = window.ShopeeHUD.modules.module3 = AS.modules.module3 || {});

  const CHECKLIST_STORAGE_KEY = "shopee_hud_m3_checklist";
  const FB_LINKS_STORAGE_KEY = "shopee_hud_m3_fblinks";

  // Luật và tọa độ (% màn hình)
  const RULE = {
    modalWaitMs: 1200,                                   // A: chờ hộp thoại tối đa 1200ms
    pollMs: 15,                                          // B: quét mỗi 15ms
    priceTimeoutMs: 8000,                                // B: quá lâu thì không cho bấm
    voucherTap: { x: 90.8, y: 58.6 },                    // A: mã số 1
    totalAt: { x: 48, y: 95.5 },                         // C: vùng “Tổng cộng”
    submitPixel: null                                    // C (tùy chọn): { x, y, rgb: [238, 77, 45], tol: 40 }
  };

  // Cảm biến CHỈ ĐỌC màn hình
  const pasteSensor = {
    fullText: () => document.getElementById("m3-ocr")?.value || "",
    textAt: () => "",
    colorAt: () => null
  };
  let sensor = pasteSensor;
  M.attachSensor = (s) => { sensor = s; };
  M.rule = RULE;

  const text = () => sensor.fullText() || "";
  const has = (s) => text().includes(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const vnd = (n) => (Number(n) || 0).toLocaleString("vi-VN") + "đ";

  const REASON = {
    LOCKED: "đã khóa",
    NOT_ARMED: "chưa gài",
    LOADING: "đang tính giá",
    TOAST_MISSING: "chưa thấy thông báo áp mã",
    PRICE_UNREADABLE: "không đọc được tổng tiền",
    PRICE_NOT_REDUCED: "giá vẫn nguyên, mã chưa trừ",
    SUBMIT_PIXEL_MISMATCH: "nút Đặt hàng chưa sáng"
  };

  // Kiểm tra trước giờ G
  const PREP = {
    spaylater: "Đã chọn SPayLater kỳ hạn x1 tháng",
    oldDiscountOff: "Đã bỏ chọn mã giảm 20% cũ để mã 11tr lên đầu",
    vipBubbleOff: "Đã tắt bong bóng “Shopee VIP” góc dưới phải",
    noManualCode: "Không nhập tay mã, chỉ chọn mã đã lưu trong kho"
  };
  M.checks = { ...Object.fromEntries(Object.keys(PREP).map((k) => [k, false])), billPaid: false };

  let fbLinks = [];
  let pollIntervalId = null;

  const note = (msg) => {
    const log = document.getElementById("m3-log");
    if (!log) return;
    const li = document.createElement("li");
    li.textContent = new Date().toLocaleTimeString("vi-VN") + "  " + msg;
    log.prepend(li);
    while (log.children.length > 40) log.lastElementChild.remove();
  };

  const waitUntil = async (pred, ms) => {
    const end = performance.now() + ms;
    while (!pred()) {
      if (performance.now() >= end) return false;
      await sleep(RULE.pollMs);
    }
    return true;
  };

  // Đọc “Tổng cộng”: ưu tiên vùng tọa độ, không có thì đọc ngay sau nhãn
  const readTotal = () => {
    const src = sensor.textAt(RULE.totalAt.x, RULE.totalAt.y) || (text().split("Tổng cộng")[1] || text().split("Tổng thanh toán")[1] || "").slice(0, 60);
    const m = src.match(/\d{1,3}(?:[.,]\d{3})+|\d{4,}/);
    return m ? Number(m[0].replace(/\D/g, "")) : null;
  };

  const pixelOk = () => {
    const p = RULE.submitPixel;
    if (!p) return true;
    const c = sensor.colorAt(p.x, p.y);
    return !!c && p.rgb.every((v, i) => Math.abs(c[i] - v) <= p.tol);
  };

  M.preflight = () => {
    const blockers = [], warnings = [];
    const approval = (Number(L.cartOriginalPrice) || 11500000) - (Number(L.shopDiscount) || 0);
    if (approval < L.targetMinOrder) {
      blockers.push(`Giá xét duyệt ${vnd(approval)} dưới đơn tối thiểu ${vnd(L.targetMinOrder)}, mã Shop đã làm tụt giá trị đơn`);
    }
    for (const k in PREP) {
      if (!M.checks[k]) blockers.push(PREP[k]);
    }
    if (!(Date.parse(S.targetTimeIso) > Date.now())) {
      blockers.push("Thời điểm mục tiêu không hợp lệ hoặc đã qua");
    }
    const daysLeft = Math.ceil((Date.parse(L.pendingBillDueDate + "T23:59:59+07:00") - Date.now()) / 864e5);
    const dueLabel = L.pendingBillDueDate.split("-").reverse().join("/");
    if (L.pendingBillAmount > 0 && !M.checks.billPaid) {
      warnings.push(`Thanh toán ${vnd(L.pendingBillAmount)} trước hạn ${dueLabel}, ${daysLeft >= 0 ? `còn ${daysLeft} ngày` : "đã quá hạn"}`);
    }
    return { ok: blockers.length === 0, blockers, warnings, approval };
  };

  // Cầu dao: giá vẫn nguyên thì khóa và phát sự kiện
  const lock = (reason, total = null) => {
    L.abortTriggered = true;
    S.isArmed = false;
    bus.emit("circuit-breaker-abort", { reason, total, at: Date.now() });
    note(`🔒 Khóa: ${reason}${total === null ? "" : " · " + vnd(total)}`);
    return { ok: false, reason };
  };

  // Cổng duy nhất trước khi bấm “Đặt hàng”
  M.canSubmit = () => {
    if (L.abortTriggered) return { ok: false, reason: "LOCKED" };
    if (!S.isArmed) return { ok: false, reason: "NOT_ARMED" };
    if (has(UI.loadingIndicatorText)) return { ok: false, reason: "LOADING" };
    if (!has(UI.successToastText)) return { ok: false, reason: "TOAST_MISSING" };
    const total = readTotal();
    if (total === null) return { ok: false, reason: "PRICE_UNREADABLE" };
    if (total > L.expectedMaxFinalPrice) return lock("PRICE_NOT_REDUCED", total);
    if (RULE.submitPixel && !pixelOk()) return { ok: false, reason: "SUBMIT_PIXEL_MISMATCH" };
    return { ok: true, total };
  };

  M.waitVoucherModal = async () => {
    if (!(await waitUntil(() => has(UI.waitForModalTitle), RULE.modalWaitMs)))
      return { ok: false, msg: "✖ Không thấy hộp thoại sau 1200ms, không bấm mù" };
    if (!has(UI.targetVoucherText))
      return { ok: false, msg: `✖ Hộp thoại không có “${UI.targetVoucherText}”, không báo bấm` };
    return { ok: true, msg: `▶ Bấm mã số 1 tại (${RULE.voucherTap.x}%, ${RULE.voucherTap.y}%)` };
  };

  M.waitPriceReady = async () => {
    const ready = () => !has(UI.loadingIndicatorText) && has(UI.successToastText);
    if (!(await waitUntil(ready, RULE.priceTimeoutMs)))
      return { ok: false, msg: "✖ Quá lâu chưa tính xong giá, không cho bấm" };
    const g = M.canSubmit();
    return g.ok
      ? { ok: true, msg: `✔ Giá ${vnd(g.total)}: sẵn sàng, bạn tự bấm Đặt hàng` }
      : { ok: false, msg: `✖ Chặn: ${REASON[g.reason] || g.reason}` };
  };

  M.arm = () => {
    const pf = M.preflight();
    if (L.abortTriggered) pf.blockers.unshift("đang khóa, bấm Reset sau khi kiểm tra lại giá");
    pf.ok = pf.blockers.length === 0;
    S.isArmed = pf.ok;
    return pf;
  };
  M.disarm = () => { S.isArmed = false; };
  M.reset = () => { L.abortTriggered = false; S.isArmed = false; };

  function renderHTML() {
    const root = document.getElementById("module-3-root");
    if (!root) return;

    // Load saved checklist & links
    try {
      const savedCheck = localStorage.getItem(CHECKLIST_STORAGE_KEY);
      if (savedCheck) {
        const parsed = JSON.parse(savedCheck);
        Object.assign(M.checks, parsed);
      }
      const savedLinks = localStorage.getItem(FB_LINKS_STORAGE_KEY);
      if (savedLinks) fbLinks = JSON.parse(savedLinks);
    } catch (_) {}

    root.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl space-y-6">
        <!-- Header -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div class="flex items-center space-x-3">
            <span class="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </span>
            <div>
              <h2 class="text-lg font-bold text-slate-100 flex items-center gap-2">
                Module 3: Smart Screen Rules &amp; Circuit Breaker
              </h2>
              <p class="text-xs text-slate-400">Cầu dao giá 15ms, kiểm toán đơn 5 triệu &amp; bảo vệ hạn mức SPayLater</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span id="m3-arm-status" class="px-2.5 py-1 rounded-full text-xs font-mono font-bold ${S.isArmed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'}">
              ARM: ${S.isArmed ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        <!-- 1. CỔNG AN TOÀN TRUNG TÂM (CIRCUIT BREAKER GATE) -->
        <div id="m3-gate" class="rounded-xl bg-slate-800 p-4 text-center text-lg font-black tracking-wide shadow-lg transition-all duration-100 select-none">
          —
        </div>

        <!-- 2. GRID THÔNG SỐ ĐỌC ĐƯỢC -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          <div class="rounded-lg bg-slate-950/70 border border-slate-800 p-3">
            <div class="text-[11px] text-slate-400 font-semibold uppercase">Giá xét duyệt</div>
            <div id="m3-approval" class="text-base font-bold font-mono text-cyan-400">—</div>
            <div class="text-[10px] text-slate-500">Gốc - Shop Voucher</div>
          </div>
          <div class="rounded-lg bg-slate-950/70 border border-slate-800 p-3">
            <div class="text-[11px] text-slate-400 font-semibold uppercase">Tổng đọc được</div>
            <div id="m3-total" class="text-base font-bold font-mono text-emerald-400">—</div>
            <div class="text-[10px] text-slate-500">Từ màn hình / OCR</div>
          </div>
          <div class="rounded-lg bg-slate-950/70 border border-slate-800 p-3 col-span-2 sm:col-span-1">
            <div class="text-[11px] text-slate-400 font-semibold uppercase">Hạn mức rủi ro</div>
            <div class="text-base font-bold font-mono text-amber-400">${vnd(L.walletLimitAtRisk)}</div>
            <div class="text-[10px] text-slate-500">SPayLater khả dụng</div>
          </div>
        </div>

        <!-- Cảnh báo & Blockers -->
        <ul id="m3-warn" class="space-y-1 text-xs"></ul>

        <!-- 3. PRE-FLIGHT CHECKLIST (GÀI AN TOÀN) -->
        <div class="space-y-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
          <div class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>Checklist Sống Còn Trước Giờ G</span>
            <span class="text-[10px] font-mono text-slate-500">Yêu cầu đủ 100% để Gài</span>
          </div>
          <div id="m3-checks" class="space-y-1.5 text-xs"></div>
        </div>

        <!-- 4. THỬ NGHIỆM CẢM BIẾN MÀN HÌNH / OCR -->
        <div class="space-y-2 bg-slate-950/50 border border-slate-800 rounded-xl p-3.5">
          <label class="block text-xs font-bold text-slate-300 uppercase tracking-wider">
            Thử Nghiệm Cảm Biến Chữ Màn Hình (OCR Simulation)
          </label>
          <textarea id="m3-ocr" rows="3" class="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500" placeholder="Thử nghiệm: dán chữ đang thấy trên màn hình (khi chưa gắn cảm biến thật)">Chọn Shopee Voucher\nSPayLater Giảm 11trđ\nĐồng ý\nĐã áp dụng 2 Voucher\nTổng thanh toán: 500.000đ\nĐặt hàng</textarea>
        </div>

        <!-- 5. HÀNG NÚT THAO TÁC CỦA MODULE 3 -->
        <div class="flex flex-wrap gap-2 text-xs">
          <button data-act="voucher" class="rounded-lg bg-indigo-600 px-3 py-2 font-bold text-white hover:bg-indigo-500 active:scale-95 transition shadow">
            ① Chờ Hộp Thoại (1.2s)
          </button>
          <button data-act="price" class="rounded-lg bg-indigo-600 px-3 py-2 font-bold text-white hover:bg-indigo-500 active:scale-95 transition shadow">
            ② Đã Bấm Đồng Ý &amp; Đợi Giá
          </button>
          <button data-act="arm" class="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white hover:bg-emerald-500 active:scale-95 transition shadow">
            Kiểm Tra &amp; Gài (ARM)
          </button>
          <button data-act="disarm" class="rounded-lg bg-slate-700 px-3 py-2 font-medium text-slate-200 hover:bg-slate-600 active:scale-95 transition">
            Tắt Gài
          </button>
          <button data-act="reset" class="rounded-lg bg-red-700 px-3 py-2 font-bold text-white hover:bg-red-600 active:scale-95 transition">
            Reset Khóa
          </button>
        </div>

        <!-- 6. NHẬT KÝ KIỂM TRA M3 (LOG) -->
        <div class="space-y-1">
          <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nhật Ký Cầu Dao &amp; Cảm Biến</div>
          <ol id="m3-log" class="max-h-40 space-y-1 overflow-auto rounded-lg bg-black/60 border border-slate-800 p-2 font-mono text-[11px] text-slate-400"></ol>
        </div>

        <!-- 7. TRÌNH QUẢN LÝ LINK FACEBOOK 25% -->
        <div class="pt-3 border-t border-slate-800 space-y-2">
          <div class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>Link Săn Mã Facebook (25% - 50%)</span>
            <span class="text-[10px] text-slate-400 font-mono">Báo động &gt; 15p</span>
          </div>
          <div class="flex gap-2">
            <input id="m3-inp-conv-link" type="text" placeholder="Dán link trung gian (Nô Tì / FB)..." class="flex-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 p-2 font-mono focus:outline-none focus:border-cyan-500" />
            <button id="m3-btn-add-fb" class="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition active:scale-95 shrink-0">
              Lưu Link
            </button>
          </div>
          <div id="m3-links-container" class="space-y-1.5 pt-1"></div>
        </div>
      </div>
    `;

    bindUI();
    startGateLoop();
  }

  function bindUI() {
    const checksContainer = document.getElementById("m3-checks");
    if (checksContainer) {
      checksContainer.innerHTML = Object.entries({
        ...PREP,
        billPaid: "Đã thanh toán hóa đơn trả sau 1.228.876đ trước hạn 10/11"
      }).map(([k, label]) => `
        <label class="flex items-center gap-2 p-1.5 rounded hover:bg-slate-900 cursor-pointer select-none">
          <input type="checkbox" data-check="${k}" ${M.checks[k] ? 'checked' : ''} class="h-4 w-4 rounded accent-indigo-500 border-slate-700 cursor-pointer">
          <span class="${M.checks[k] ? 'text-slate-200 font-semibold' : 'text-slate-400'}">${label}</span>
        </label>
      `).join("");

      checksContainer.addEventListener("change", (e) => {
        if (e.target.dataset.check) {
          M.checks[e.target.dataset.check] = e.target.checked;
          try {
            localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(M.checks));
          } catch (_) {}
          AS.persistState?.();
        }
      });
    }

    const rootEl = document.getElementById("module-3-root");
    if (rootEl) {
      rootEl.addEventListener("click", async (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (!act) return;

        if (act === "voucher") {
          note((await M.waitVoucherModal()).msg);
          AS.beep?.(660, 100);
        }
        if (act === "price") {
          note((await M.waitPriceReady()).msg);
          AS.beep?.(880, 100);
        }
        if (act === "arm") {
          const pf = M.arm();
          note(pf.ok ? "✔ Đã gài: pre-flight đạt" : "✖ Chưa gài: " + pf.blockers.join(" · "));
          const armBadge = document.getElementById("m3-arm-status");
          if (armBadge) {
            armBadge.textContent = "ARM: " + (S.isArmed ? "ON" : "OFF");
            armBadge.className = `px-2.5 py-1 rounded-full text-xs font-mono font-bold ${S.isArmed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'}`;
          }
          if (pf.ok) AS.beep?.(1046, 150);
          else AS.beep?.(350, 150);
        }
        if (act === "disarm") {
          M.disarm();
          note("Đã tắt gài");
          const armBadge = document.getElementById("m3-arm-status");
          if (armBadge) {
            armBadge.textContent = "ARM: OFF";
            armBadge.className = "px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-400";
          }
        }
        if (act === "reset") {
          M.reset();
          note("Đã reset khóa, cần gài lại");
          const armBadge = document.getElementById("m3-arm-status");
          if (armBadge) {
            armBadge.textContent = "ARM: OFF";
            armBadge.className = "px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-400";
          }
        }
      });
    }

    const btnAddFb = document.getElementById("m3-btn-add-fb");
    if (btnAddFb) {
      btnAddFb.addEventListener("click", () => {
        const inp = document.getElementById("m3-inp-conv-link");
        if (inp && inp.value.trim()) {
          fbLinks.unshift({ url: inp.value.trim(), createdAt: Date.now() });
          inp.value = "";
          try {
            localStorage.setItem(FB_LINKS_STORAGE_KEY, JSON.stringify(fbLinks));
          } catch (_) {}
          renderFbLinks();
        }
      });
    }

    renderFbLinks();
  }

  function renderFbLinks() {
    const container = document.getElementById("m3-links-container");
    if (!container) return;
    if (fbLinks.length === 0) {
      container.innerHTML = `<div class="text-[10px] text-slate-500 italic">Chưa có link Facebook nào được lưu.</div>`;
      return;
    }
    container.innerHTML = fbLinks.slice(0, 3).map((l, i) => {
      const ageMin = Math.floor((Date.now() - l.createdAt) / 60000);
      const isOld = ageMin >= 15;
      return `
        <div class="p-2 rounded bg-slate-950/70 border border-slate-800 flex justify-between items-center text-xs">
          <div class="overflow-hidden space-y-0.5">
            <div class="font-mono text-cyan-400 truncate max-w-xs text-[11px]">${l.url}</div>
            <div class="text-[10px] ${isOld ? 'text-rose-400 font-bold' : 'text-slate-400'}">${ageMin} phút trước ${isOld ? '(QUÁ 15P - CẦN ĐỔI LINK)' : '(An toàn)'}</div>
          </div>
          <button onclick="window.ShopeeHUD.modules.module3.deleteFbLink(${i})" class="text-slate-500 hover:text-rose-400 text-xs px-2 py-1">Xóa</button>
        </div>
      `;
    }).join("");
  }

  M.deleteFbLink = function (index) {
    fbLinks.splice(index, 1);
    try {
      localStorage.setItem(FB_LINKS_STORAGE_KEY, JSON.stringify(fbLinks));
    } catch (_) {}
    renderFbLinks();
  };

  // Làm mới HUD mỗi 15ms
  function startGateLoop() {
    if (pollIntervalId) clearInterval(pollIntervalId);
    const put = (id, v) => {
      const el = document.getElementById(id);
      if (el && el.dataset.v !== v) {
        el.dataset.v = v;
        el.innerHTML = v;
      }
    };

    pollIntervalId = setInterval(() => {
      const g = M.canSubmit();
      const pf = M.preflight();
      const t = readTotal();

      const [label, tone] = L.abortTriggered
        ? ["🔒 KHÓA · không bấm Đặt hàng", "bg-red-700 text-white animate-pulse"]
        : g.ok
        ? ["✔ SẴN SÀNG · bạn tự bấm Đặt hàng", "bg-emerald-700 text-white shadow-emerald-900/50"]
        : [`⏳ CHỜ · ${REASON[g.reason] || g.reason}`, "bg-amber-700 text-amber-100"];

      put("m3-gate", label);
      const gateEl = document.getElementById("m3-gate");
      if (gateEl) {
        gateEl.className = `rounded-xl p-4 text-center text-lg font-black tracking-wide shadow-lg transition-all duration-100 select-none ${tone}`;
      }

      put("m3-approval", vnd(pf.approval));
      put("m3-total", t === null ? "không đọc được" : vnd(t));

      const warnEl = document.getElementById("m3-warn");
      if (warnEl) {
        const warnHtml = [
          ...pf.blockers.map((b) => `<li class="text-rose-400 font-semibold flex items-center gap-1">✖ ${b}</li>`),
          ...pf.warnings.map((w) => `<li class="text-amber-400 flex items-center gap-1">⚠ ${w}</li>`)
        ].join("");
        if (warnEl.dataset.v !== warnHtml) {
          warnEl.dataset.v = warnHtml;
          warnEl.innerHTML = warnHtml;
        }
      }
    }, RULE.pollMs);
  }

  M.init = function () {
    renderHTML();
  };
})();
