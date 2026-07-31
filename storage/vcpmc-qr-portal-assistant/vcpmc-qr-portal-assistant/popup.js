// popup.js — VCPMC QR Portal Assistant v2.2

(function () {
  var el = function (id) { return document.getElementById(id); };
  var btnFill       = el('btnFill');
  var btnScan       = el('btnScan');
  var btnPreview    = el('btnPreview');
  var btnCopyJson   = el('btnCopyJson');
  var btnClear      = el('btnClear');
  var btnOpenPortal = el('btnOpenPortal');
  var extBadge      = el('extBadge');
  var extStatus     = el('extStatus');
  var popupBadge    = el('popupBadge');
  var popupStatus   = el('popupStatus');
  var dataSummary   = el('dataSummary');
  var mappingSummary= el('mappingSummary');
  var mappingTable  = el('mappingTable');
  var resultBox     = el('resultBox');

  var currentPayload = null;
  var lastScanResult = null;

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setBadge(badgeEl, text, color) {
    badgeEl.querySelector('span:last-child').textContent = text;
    badgeEl.className = 'badge ' + color;
  }

  function showResult(message, type) {
    resultBox.className = 'result-box show ' + type;
    resultBox.innerHTML = '<pre>' + escapeHtml(message) + '</pre>';
    mappingTable.className = 'mapping-table';
    mappingSummary.className = 'mapping-summary';
  }

  function hideResult() {
    resultBox.className = 'result-box';
    resultBox.innerHTML = '';
  }

  function setBtnLoading(btn, loading, text) {
    btn.disabled = loading;
    btn.innerHTML = loading
      ? '<span class="loading"></span> ' + (text || 'Đang xử lý...')
      : btn.getAttribute('data-orig') || btn.textContent;
  }

  // Store original button text
  function storeOrig(btn, text) { btn.setAttribute('data-orig', text); }

  // ─── Render mapping table ───────────────────────────────────────────────────
  function renderMappingTable(payload, scanResult) {
    if (!payload || !scanResult) return;

    var found = scanResult.found || [];
    var foundSet = {};
    for (var fi = 0; fi < found.length; fi++) foundSet[found[fi]] = true;

    var fields = [
      { name: 'so_hop_dong',                 label: 'Số hợp đồng',          req: true,  val: payload.contract_no },
      { name: 'so_giay_chung_nhan',          label: 'Số GCN',               req: true,  val: payload.certificate_no },
      { name: 'ngay_bat_dau',                label: 'Ngày bắt đầu',        req: true,  val: payload.effective_from },
      { name: 'ngay_ket_thuc',               label: 'Ngày kết thúc',        req: true,  val: payload.effective_to },
      { name: 'ten_don_vi',                  label: 'Tên đơn vị',          req: true,  val: payload.organization_name },
      { name: 'dia_chi',                     label: 'Địa chỉ',             req: true,  val: payload.usage_address || payload.address },
      { name: 'ngay_in_giay_chung_nhan',     label: 'Ngày in GCN',          req: false, val: payload.issue_date || payload.certificate_issue_date },
      { name: 'mui-component-select-tinh_trang', label: 'Tình trạng',        req: false, val: payload.tinh_trang || 'Phát hành' },
      { name: 'mui-component-select-linh_vuc',    label: 'Lĩnh vực',          req: false, val: payload.linh_vuc || payload.domain },
      { name: 'ma_so_thue',                  label: 'Mã số thuế',           req: false, val: payload.tax_code },
      { name: 'ten_bang_hieu',               label: 'Tên bảng hiệu',        req: false, val: payload.brand_name },
      { name: 'dia_chi_kinh_doanh',          label: 'Địa chỉ kinh doanh',   req: false, val: payload.usage_address || payload.address },
    ];

    var reqCount = { ok: 0, miss: 0 };
    var optCount = { ok: 0, skip: 0 };

    var html = '<table>';
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var exists = !!foundSet[f.name];
      var val = f.val;

      if (f.name.indexOf('ngay_') === 0 && val) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
          var p = val.split('-');
          val = p[2] + '/' + p[1] + '/' + p[0];
        }
      }

      var rowClass, statusText;
      if (exists) {
        rowClass = 'ok';
        var badge = f.req ? 'badge-req' : 'badge-opt';
        var badgeLabel = f.req ? 'Bắt buộc' : 'Tùy chọn';
        statusText = escapeHtml(String(val || '—').substring(0, 45)) +
          ' <span class="' + badge + '">' + badgeLabel + '</span>';
        if (f.req) reqCount.ok++;
        else optCount.ok++;
      } else {
        if (f.req) {
          rowClass = 'err';
          statusText = 'Không tìm thấy trên popup';
          reqCount.miss++;
        } else {
          rowClass = 'skip';
          statusText = 'Không có / cần kiểm tra';
          optCount.skip++;
        }
      }

      html += '<tr class="' + rowClass + '"><td>' + escapeHtml(f.label) + '</td><td>' + statusText + '</td></tr>';
    }
    html += '</table>';

    mappingTable.innerHTML = html;
    mappingTable.className = 'mapping-table show';

    var smClass = reqCount.miss > 0 ? 'err' : 'ok';
    var smParts = [];
    smParts.push('<span class="' + smClass + '">Bắt buộc: ' + reqCount.ok + '/' + (reqCount.ok + reqCount.miss) + ' OK</span>');
    if (optCount.skip > 0) {
      smParts.push('<span class="warn">Tùy chọn: ' + optCount.ok + '/' + (optCount.ok + optCount.skip) + ' skipped</span>');
    } else if (optCount.ok > 0) {
      smParts.push('<span class="ok">Tùy chọn: ' + optCount.ok + '/' + (optCount.ok + optCount.skip) + ' OK</span>');
    }
    mappingSummary.innerHTML = smParts.join('&nbsp;|&nbsp;');
    mappingSummary.className = 'mapping-summary';
  }

  // ─── Load payload ────────────────────────────────────────────────────────────
  function loadPayload() {
    chrome.runtime.sendMessage({ type: 'GET_QR_PAYLOAD' }).then(function (response) {
      if (chrome.runtime.lastError || !response || !response.payload) {
        setBadge(extBadge, 'Chưa có dữ liệu', 'red');
        btnFill.disabled = true;
        btnPreview.disabled = true;
        btnCopyJson.disabled = true;
        dataSummary.style.display = 'none';
        currentPayload = null;
        return;
      }

      currentPayload = response.payload;
      setBadge(extBadge, 'Dữ liệu GCN đã sẵn sàng', 'green');
      btnFill.disabled = false;
      btnPreview.disabled = false;
      btnCopyJson.disabled = false;
      dataSummary.style.display = 'block';

      el('pContractNo').textContent = currentPayload.contract_no || '-';
      el('pCertNo').textContent = currentPayload.certificate_no || '-';
      el('pOrgName').textContent = (currentPayload.organization_name || '-').substring(0, 40);

      if (lastScanResult) renderMappingTable(currentPayload, lastScanResult);
    }).catch(function () {
      setBadge(extBadge, 'Chưa có dữ liệu', 'red');
      btnFill.disabled = true;
      currentPayload = null;
    });
  }

  // ─── Store original button texts ───────────────────────────────────────────
  storeOrig(btnFill, 'Điền vào popup đang mở');
  storeOrig(btnScan, 'Kiểm tra popup');
  storeOrig(btnPreview, 'Xem trước dữ liệu');
  storeOrig(btnCopyJson, 'Sao chép log kỹ thuật');
  storeOrig(btnClear, 'Xóa dữ liệu tạm');

  // ─── Btn: Quét popup ───────────────────────────────────────────────────────
  btnScan.addEventListener('click', function () {
    setBtnLoading(btnScan, true, 'Đang kiểm tra...');
    hideResult();
    mappingTable.className = 'mapping-table';
    mappingSummary.className = 'mapping-summary';

    chrome.runtime.sendMessage({ type: 'SCAN_QR_PORTAL_POPUP' }).then(function (response) {
      setBtnLoading(btnScan, false);

      if (!response) {
        showResult('Không nhận được phản hồi từ trang QR Portal.', 'error');
        setBadge(popupBadge, 'Lỗi kết nối', 'red');
        popupBadge.style.display = 'none';
        return;
      }

      if (response.ok) {
        setBadge(popupBadge, 'Đã phát hiện popup QR Portal', 'green');
        popupBadge.style.display = 'flex';
        lastScanResult = response;

        var msg = 'Đã quét ' + (response.total || response.found ? response.found.length : 0) + ' trường trên popup.\n';
        if (response.found && response.found.length) msg += '\nTrường tìm thấy: ' + response.found.join(', ');
        if (response.missing && response.missing.length) msg += '\n\nTrường chưa có: ' + response.missing.join(', ');
        msg += '\n\nBấm "Xem trước dữ liệu" để kiểm tra mapping.';
        showResult(msg, 'success');

        if (currentPayload) renderMappingTable(currentPayload, response);
      } else {
        setBadge(popupBadge, 'Không tìm thấy popup', 'red');
        popupBadge.style.display = 'flex';
        showResult(response.error || 'Không tìm thấy popup "Thêm mới Thông tin".\n\nHãy bấm "Thêm mới" trên QR Portal trước.', 'error');
        lastScanResult = null;
      }
    }).catch(function (err) {
      setBtnLoading(btnScan, false);
      showResult('Lỗi: ' + (err.message || 'Không rõ'), 'error');
    });
  });

  // ─── Btn: Preview mapping ─────────────────────────────────────────────────
  btnPreview.addEventListener('click', function () {
    if (!currentPayload) {
      showResult('Chưa có dữ liệu GCN.\nHãy gửi dữ liệu từ app In GCN trước.', 'warning');
      return;
    }
    if (!lastScanResult || !lastScanResult.ok) {
      showResult('Chưa kiểm tra popup.\nHãy bấm "Kiểm tra popup" trước.', 'warning');
      return;
    }
    hideResult();
    renderMappingTable(currentPayload, lastScanResult);
  });

  // ─── Btn: Điền popup ──────────────────────────────────────────────────────
  btnFill.addEventListener('click', function () {
    if (!currentPayload) {
      showResult('Chưa có dữ liệu GCN.', 'error');
      return;
    }
    setBtnLoading(btnFill, true, 'Đang điền...');
    hideResult();
    mappingTable.className = 'mapping-table';
    mappingSummary.className = 'mapping-summary';

    chrome.runtime.sendMessage({ type: 'FILL_QR_PORTAL_POPUP' }).then(function (response) {
      setBtnLoading(btnFill, false);

      if (!response) {
        showResult('Không nhận được phản hồi từ QR Portal.\nKiểm tra popup có đang mở không.', 'error');
        return;
      }

      if (response.ok) {
        lastScanResult = null;
        var lines = [];

        lines.push('Hoàn tất điền dữ liệu.');
        lines.push('Đã xử lý: ' + (response.filled ? response.filled.length : 0) + ' trường.');
        lines.push('');

        // Optional fields that were skipped — not errors, just warnings
        var selectSkipped = response.selectSkipped || [];
        var warnings = response.warnings || [];

        if (selectSkipped.length > 0 || warnings.length > 0) {
          lines.push('Cần kiểm tra thủ công:');
          for (var s = 0; s < selectSkipped.length; s++) {
            var lbl = selectSkipped[s].replace('mui-component-select-', '');
            lines.push('  - ' + lbl.replace(/_/g, ' '));
          }
          for (var w = 0; w < warnings.length; w++) {
            if (warnings[w].indexOf('Loi:') !== 0) continue;
            var nm = warnings[w].replace('Loi: ', '');
            if (nm !== 'tinh_trang' && nm !== 'linh_vuc') {
              lines.push('  ! ' + nm);
            }
          }
          lines.push('');
          lines.push('Các trường chọn danh sách có thể cần kiểm tra lại trên QR Portal.');
        }

        lines.push('Vui lòng kiểm tra và tự bấm Lưu.');

        var hasCriticalErrors = false;
        if (warnings) {
          for (var e = 0; e < warnings.length; e++) {
            if (warnings[e].indexOf('Loi:') === 0 &&
                warnings[e] !== 'Loi: tinh_trang' &&
                warnings[e] !== 'Loi: linh_vuc') {
              hasCriticalErrors = true;
            }
          }
        }
        showResult(lines.join('\n'), hasCriticalErrors ? 'warning' : 'success');
      } else {
        showResult(response.error || 'Điền thất bại.\nKiểm tra popup có đang mở không.', 'error');
      }
    }).catch(function (err) {
      setBtnLoading(btnFill, false);
      showResult('Lỗi: ' + (err.message || 'Không rõ'), 'error');
    });
  });

  // ─── Btn: Copy JSON ───────────────────────────────────────────────────────
  btnCopyJson.addEventListener('click', function () {
    if (!currentPayload) {
      showResult('Chưa có dữ liệu để sao chép.', 'warning');
      return;
    }
    var full = {
      payload: currentPayload,
      scanResult: lastScanResult || null,
      scannedAt: new Date().toISOString(),
      url: location.href
    };

    navigator.clipboard.writeText(JSON.stringify(full, null, 2)).then(function () {
      showResult('Đã sao chép log kỹ thuật vào clipboard.\nGửi cho người phát triển nếu cần hỗ trợ.', 'info');
    }).catch(function () {
      showResult('Sao chép thất bại.\n\n' + JSON.stringify(currentPayload, null, 2), 'warning');
    });
  });

  // ─── Btn: Xóa ─────────────────────────────────────────────────────────────
  btnClear.addEventListener('click', function () {
    chrome.runtime.sendMessage({ type: 'CLEAR_QR_PAYLOAD' }).then(function () {
      setBadge(extBadge, 'Chưa có dữ liệu', 'red');
      setBadge(popupBadge, 'Chưa kiểm tra', 'yellow');
      popupBadge.style.display = 'none';
      btnFill.disabled = true;
      btnPreview.disabled = true;
      btnCopyJson.disabled = true;
      dataSummary.style.display = 'none';
      mappingTable.className = 'mapping-table';
      mappingSummary.className = 'mapping-summary';
      hideResult();
      currentPayload = null;
      lastScanResult = null;
      showResult('Đã xóa dữ liệu tạm.', 'info');
    });
  });

  // ─── Btn: Mở portal ──────────────────────────────────────────────────────
  btnOpenPortal.addEventListener('click', function () {
    window.open('http://14.241.251.220:7879/dashboard/content', '_blank');
  });

  // ─── Init ──────────────────────────────────────────────────────────────────
  loadPayload();

})();
