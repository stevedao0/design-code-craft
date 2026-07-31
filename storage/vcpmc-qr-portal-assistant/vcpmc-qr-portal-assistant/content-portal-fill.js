// content-portal-fill.js — VCPMC QR Helper V2
// Field mapping profile + step-by-step fill + select safe handling.

(function () {
  'use strict';

  console.log('[VCPMC] Extension loaded on:', location.href);

  // ═══════════════════════════════════════════════════════════════════════════════
  // PROFILE — Field mapping configuration
  // ═══════════════════════════════════════════════════════════════════════════════
  var PROFILE = {
    // All expected field names (by name attribute and MUI select id)
    allFields: [
      'so_hop_dong', 'so_giay_chung_nhan', 'ngay_in_giay_chung_nhan',
      'ngay_bat_dau', 'ngay_ket_thuc', 'ten_don_vi', 'dia_chi',
      'ma_so_thue', 'ten_bang_hieu', 'dia_chi_kinh_doanh', 'ghi_chu'
    ],
    muiSelectIds: [
      'mui-component-select-tinh_trang',
      'mui-component-select-linh_vuc',
      'mui-component-select-khu_vuc'
    ],
    // Required fields (fill must exist or warning)
    required: [
      'so_hop_dong', 'so_giay_chung_nhan',
      'ngay_bat_dau', 'ngay_ket_thuc',
      'ten_don_vi', 'dia_chi'
    ],
    // Optional select fields (warning if skipped, not blocking)
    optionalSelect: [
      'mui-component-select-tinh_trang',
      'mui-component-select-linh_vuc'
    ]
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // UTILS
  // ═══════════════════════════════════════════════════════════════════════════════

  function isVisible(el) {
    if (!el) return false;
    try {
      var s = window.getComputedStyle(el);
      if (el.offsetParent === null && el.tagName.toLowerCase() !== 'body') return false;
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      var op = parseFloat(s.opacity);
      if (isNaN(op) || op <= 0) return false;
      return true;
    } catch (e) { return false; }
  }

  function setInputValue(el, value) {
    if (!el) return false;
    try {
      var proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (!desc || !desc.set) return false;
      desc.set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    } catch (e) { return false; }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DATE
  // ═══════════════════════════════════════════════════════════════════════════════

  function toDDMMYYYY(s) {
    if (!s) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var p = s.split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    }
    return s;
  }

  function toInputDate(s) {
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      var p = s.split('/');
      return p[2] + '-' + p[1] + '-' + p[0];
    }
    return s;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SCAN
  // ═══════════════════════════════════════════════════════════════════════════════

  function scanAllControls() {
    var controls = [];
    var nameSet = {};
    var idSet = {};

    var allNameEls = document.querySelectorAll('[name]');
    for (var i = 0; i < allNameEls.length; i++) {
      var el = allNameEls[i];
      var name = el.getAttribute('name');
      if (!name || nameSet[name]) continue;
      if (!isVisible(el)) continue;
      var tag = el.tagName.toLowerCase();
      var type = '';
      try { type = (el.type || '').toLowerCase(); } catch (e) { type = ''; }
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset' || type === 'image') continue;
      nameSet[name] = true;

      // Get label
      var labelText = '';
      try {
        var parent = el.closest('.MuiFormControl-root, .MuiTextField-root, .MuiInputBase-root, div');
        if (parent) {
          var lbl = parent.querySelector('label');
          if (lbl && lbl.textContent) labelText = lbl.textContent.trim();
        }
      } catch (e) { /* ignore */ }

      controls.push({
        index: controls.length,
        key: name,
        tag: tag,
        type: type,
        role: el.getAttribute('role') || '',
        name: name,
        id: el.getAttribute('id') || '',
        placeholder: el.getAttribute('placeholder') || '',
        value: el.value || '',
        labelText: labelText,
        matchedKey: null
      });
    }

    // MUI selects
    for (var j = 0; j < PROFILE.muiSelectIds.length; j++) {
      var id = PROFILE.muiSelectIds[j];
      if (idSet[id]) continue;
      var muiEl = document.getElementById(id);
      if (!muiEl || !isVisible(muiEl)) continue;
      idSet[id] = true;

      var muiLabel = '';
      try {
        var p2 = muiEl.closest('.MuiFormControl-root, .MuiTextField-root, .MuiInputBase-root');
        if (p2) {
          var ml = p2.querySelector('label');
          if (ml && ml.textContent) muiLabel = ml.textContent.trim();
        }
      } catch (e) { /* ignore */ }

      controls.push({
        index: controls.length,
        key: id,
        tag: 'mui-select',
        type: 'select',
        role: muiEl.getAttribute('role') || 'combobox',
        name: '',
        id: id,
        placeholder: '',
        value: '',
        labelText: muiLabel,
        matchedKey: null
      });
    }

    return controls;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SCAN — Full JSON (for debug)
  // ═══════════════════════════════════════════════════════════════════════════════

  function doScanFull() {
    var controls = scanAllControls();
    return {
      ok: true,
      url: location.href,
      formRootFound: true,
      controlsCount: controls.length,
      matchedFields: controls.filter(function (c) { return c.matchedKey !== null; }).length,
      unmatchedControls: [],
      controls: controls,
      found: controls.map(function (c) { return c.key; }),
      missing: [],
      total: controls.length
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FILL — Input field
  // ═══════════════════════════════════════════════════════════════════════════════

  function fillByName(name, value) {
    if (!value) return false;
    var el = document.querySelector('[name="' + name + '"]');
    if (!el || !isVisible(el)) return false;
    var type = '';
    try { type = (el.type || '').toLowerCase(); } catch (e) { type = ''; }
    if (type === 'date') {
      return setInputValue(el, toInputDate(value));
    }
    return setInputValue(el, value);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FILL — MUI Select (safe)
  // ═══════════════════════════════════════════════════════════════════════════════

  function fillMuiSelect(selectId, displayText) {
    var selectEl = document.getElementById(selectId);
    if (!selectEl || !isVisible(selectEl)) return false;

    console.log('[VCPMC] Clicking MUI select:', selectId, '->', displayText);

    // Close any open menu first by pressing Escape
    try {
      document.activeElement.blur();
    } catch (e) { /* ignore */ }

    try {
      selectEl.click();
    } catch (e) {
      try {
        selectEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      } catch (e2) { return false; }
    }

    var attempt = 0;
    var maxAttempts = 20;

    function tryFind() {
      attempt++;
      if (attempt > maxAttempts) return false;

      // Find all visible option elements
      var menuRoots = document.querySelectorAll(
        '.MuiMenu-paper, .MuiPopover-paper, [role="presentation"], [role="menu"], .MuiSelect-menu'
      );

      var options = [];
      for (var ri = 0; ri < menuRoots.length; ri++) {
        var menu = menuRoots[ri];
        if (!isVisible(menu)) continue;
        var found = menu.querySelectorAll('[role="option"]:not([aria-disabled="true"]), .MuiMenuItem-root:not([aria-disabled="true"])');
        for (var oi = 0; oi < found.length; oi++) {
          var opt = found[oi];
          if (isVisible(opt)) options.push(opt);
        }
      }

      // If no menu root found, search all options on page
      if (options.length === 0) {
        var allOpts = document.querySelectorAll('[role="option"]:not([aria-disabled="true"])');
        for (var ai = 0; ai < allOpts.length; ai++) {
          if (isVisible(allOpts[ai])) options.push(allOpts[ai]);
        }
      }

      var dl = displayText.trim().toLowerCase();
      for (var i = 0; i < options.length; i++) {
        var opt = options[i];
        var optText = (opt.textContent || '').trim();
        if (optText.toLowerCase() === dl ||
            optText.toLowerCase().indexOf(dl) !== -1 ||
            dl.indexOf(optText.toLowerCase()) !== -1) {
          console.log('[VCPMC] Found option:', optText, '-> clicking');
          try { opt.click(); } catch (e) {
            try { opt.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (e2) { continue; }
          }
          return true;
        }
      }

      // Retry
      setTimeout(tryFind, 100);
      return false;
    }

    return tryFind();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FILL — Main
  // ═══════════════════════════════════════════════════════════════════════════════

  function doFill(payload) {
    console.log('[VCPMC] doFill, payload:', JSON.stringify(payload));

    var controls = scanAllControls();
    var foundNames = {};
    for (var ci = 0; ci < controls.length; ci++) foundNames[controls[ci].key] = true;

    var logs = [];
    var filled = [];
    var skipped = [];
    var warnings = [];
    var missing = [];

    function tryFill(key, value) {
      if (!value) {
        warnings.push('Rong: ' + key);
        logs.push('  — ' + key + ': (rong)');
        return;
      }
      var ok = fillByName(key, value);
      if (ok) {
        filled.push(key);
        logs.push('  + ' + key + ': ' + String(value).substring(0, 40));
      } else {
        warnings.push('Loi: ' + key);
        logs.push('  ! ' + key + ': loi dien');
      }
    }

    function tryMuiSelect(key, value) {
      if (!value) {
        warnings.push('Rong: ' + key);
        logs.push('  — ' + key + ': (rong)');
        return;
      }
      var ok = fillMuiSelect(key, value);
      if (ok) {
        filled.push(key);
        logs.push('  + ' + key + ': ' + value);
      } else {
        // Optional select: skip with warning, not error
        skipped.push(key);
        logs.push('  ~ ' + key + ': select-skipped (' + value + ')');
      }
    }

    // Check required fields exist
    logs.push('[1] Kiem tra popup...');
    for (var ri = 0; ri < PROFILE.required.length; ri++) {
      var req = PROFILE.required[ri];
      if (!foundNames[req]) {
        missing.push(req);
        logs.push('  X ' + req + ': khong co truong nay');
      }
    }

    // Start fill
    logs.push('[2] Bat dau dien...');

    // Required
    tryFill('so_hop_dong', payload.contract_no);
    tryFill('so_giay_chung_nhan', payload.certificate_no);
    tryFill('ngay_bat_dau', toDDMMYYYY(payload.effective_from));
    tryFill('ngay_ket_thuc', toDDMMYYYY(payload.effective_to));
    tryFill('ten_don_vi', payload.organization_name);
    tryFill('dia_chi', payload.usage_address || payload.address);

    logs.push('[3] Cac truong tuy chon...');

    // Optional: Ngay in GCN
    var ngayIn = payload.issue_date || payload.certificate_issue_date || '';
    if (!ngayIn) {
      var t = new Date();
      ngayIn = String(t.getDate()).padStart(2,'0') + '/' + String(t.getMonth()+1).padStart(2,'0') + '/' + t.getFullYear();
    } else {
      ngayIn = toDDMMYYYY(ngayIn);
    }
    tryFill('ngay_in_giay_chung_nhan', ngayIn);

    // Optional: Tinh trang (MUI select — optional, warn if skipped)
    tryMuiSelect('mui-component-select-tinh_trang', payload.tinh_trang || 'Phát hành');

    // Optional: Linh vuc (MUI select — optional, warn if skipped)
    var linhVuc = payload.linh_vuc || payload.domain || '';
    if (linhVuc) {
      linhVuc = (linhVuc.toLowerCase().indexOf('karaoke') !== -1) ? 'Karaoke' : linhVuc;
      tryMuiSelect('mui-component-select-linh_vuc', linhVuc);
    }

    // Extra
    if (payload.tax_code) tryFill('ma_so_thue', payload.tax_code);
    if (payload.brand_name) tryFill('ten_bang_hieu', payload.brand_name);
    if (payload.usage_address || payload.address) tryFill('dia_chi_kinh_doanh', payload.usage_address || payload.address);

    logs.push('[4] Ket qua...');

    var reqFilled = 0;
    for (var fi = 0; fi < filled.length; fi++) {
      for (var ri2 = 0; ri2 < PROFILE.required.length; ri2++) {
        if (filled[fi] === PROFILE.required[ri2]) reqFilled++;
      }
    }

    return {
      ok: true,
      filled: filled,
      skipped: skipped,
      warnings: warnings,
      missing: missing,
      logs: logs,
      requiredOk: reqFilled + '/' + PROFILE.required.length,
      totalFilled: filled.length,
      selectSkipped: skipped
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // OVERLAY — Step-by-step report
  // ═══════════════════════════════════════════════════════════════════════════════

  function showOverlay(lines, type) {
    try {
      var existing = document.getElementById('vcpmc-qr-overlay');
      if (existing) existing.remove();

      var div = document.createElement('div');
      div.id = 'vcpmc-qr-overlay';

      var bc = type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#2563eb';
      var bg = type === 'success' ? '#f0fdf4' : type === 'error' ? '#fef2f2' : '#eff6ff';
      var tc = type === 'success' ? '#15803d' : type === 'error' ? '#b91c1c' : '#1d4ed8';

      div.style.cssText = [
        'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
        'padding:0', 'border-radius:10px',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'font-size:12px', 'max-width:480px',
        'box-shadow:0 8px 32px rgba(0,0,0,0.22)',
        'background:' + bg, 'color:' + tc,
        'overflow:hidden'
      ].join(';');

      // Header
      var header = document.createElement('div');
      header.style.cssText = [
        'padding:10px 14px', 'border-bottom:1px solid rgba(0,0,0,0.08)',
        'display:flex', 'align-items:center', 'justify-content:space-between',
        'border-left:4px solid ' + bc
      ].join(';');
      header.innerHTML = '<strong style="font-size:13px">VCPMC QR Portal Assistant</strong><span style="font-size:11px;opacity:0.7">v2.1</span>';

      // Log body
      var body = document.createElement('div');
      body.style.cssText = [
        'padding:10px 14px', 'max-height:280px', 'overflow-y:auto',
        'font-family:monospace', 'font-size:11px', 'line-height:1.8',
        'white-space:pre-wrap', 'word-break:break-all'
      ].join(';');
      body.textContent = lines.join('\n');

      // Footer
      var footer = document.createElement('div');
      footer.style.cssText = [
        'padding:8px 14px', 'border-top:1px solid rgba(0,0,0,0.06)',
        'display:flex', 'gap:8px', 'align-items:center'
      ].join(';');
      footer.innerHTML = '<span style="font-size:10px;opacity:0.6">Dữ liệu chỉ trên máy local</span>';

      div.appendChild(header);
      div.appendChild(body);
      div.appendChild(footer);
      document.body.appendChild(div);

      setTimeout(function () {
        try { if (div.parentNode) div.remove(); } catch (e) {}
      }, 20000);
    } catch (e) { console.error('[VCPMC] Overlay error:', e); }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // MESSAGE LISTENER
  // ═══════════════════════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || !msg.type) return false;

    if (msg.type === 'DO_FILL_QR_PORTAL') {
      console.log('[VCPMC] DO_FILL_QR_PORTAL received');

      chrome.storage.local.get('vcpmc_qr_payload_v2').then(function (result) {
        var payload = result['vcpmc_qr_payload_v2'] || null;

        if (!payload) {
          showOverlay(['[E] Chưa có dữ liệu GCN.', 'Hãy gửi dữ liệu từ app In GCN trước.'], 'error');
          sendResponse({ ok: false, error: 'Chưa có dữ liệu.' });
          return;
        }

        var r = doFill(payload);

        if (r.ok) {
          var lines = [];
          lines.push('Đã điền thông tin vào popup QR.');
          lines.push('Đã xử lý ' + r.filled.length + ' trường.');
          lines.push('');

          var selectSkipped = r.selectSkipped || [];
          var hasCriticalWarnings = false;
          if (r.warnings) {
            for (var wi = 0; wi < r.warnings.length; wi++) {
              var w = r.warnings[wi];
              if (w.indexOf('Loi:') === 0 && w !== 'Loi: tinh_trang' && w !== 'Loi: linh_vuc') {
                hasCriticalWarnings = true;
              }
            }
          }

          if (selectSkipped.length > 0 || hasCriticalWarnings) {
            lines.push('Cần kiểm tra thủ công:');
            for (var si = 0; si < selectSkipped.length; si++) {
              var lbl = selectSkipped[si].replace('mui-component-select-', '').replace(/_/g, ' ');
              lines.push('  - ' + lbl);
            }
            if (hasCriticalWarnings) {
              lines.push('');
              lines.push('Một số trường gặp lỗi khi điền.');
            }
            lines.push('');
            lines.push('Các trường chọn danh sách có thể cần kiểm tra lại trên QR Portal.');
          }

          lines.push('');
          lines.push('Vui lòng kiểm tra lại và tự bấm Lưu.');
          showOverlay(lines, hasCriticalWarnings ? 'warning' : 'success');
        } else {
          showOverlay(['[E] Điền thất bại: ' + (r.error || 'không rõ'),
                       '',
                       'Kiểm tra popup có đang mở không.'], 'error');
        }
        sendResponse(r);
      }).catch(function (err) {
        sendResponse({ ok: false, error: 'Storage error: ' + String(err) });
      });

      return true;
    }

    if (msg.type === 'DO_SCAN_QR_PORTAL') {
      console.log('[VCPMC] DO_SCAN_QR_PORTAL received');
      var r = doScanFull();
      sendResponse(r);
      return false;
    }

    return false;
  });

})();
