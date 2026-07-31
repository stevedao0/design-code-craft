// content-app-bridge.js — VCPMC QR Helper V2
// Lang nghe postMessage tu app page, gui sang extension
// Ho tro day du cac message types tu frontend certificatesClient.ts

(function () {
  'use strict';

  const SERVICE_NAME = 'vcpmc-qr-helper';

  // Resolve runtime version from manifest — do NOT hardcode.
  // Fallback to '0.0' only if chrome.runtime is unavailable.
  let EXTENSION_VERSION = '0.0';
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function') {
      const manifest = chrome.runtime.getManifest();
      if (manifest && typeof manifest.version === 'string' && manifest.version.length > 0) {
        EXTENSION_VERSION = manifest.version;
      }
    }
  } catch (manifestErr) {
    // Keep fallback '0.0' — extension should still respond so app can show "connected" with unknown version.
  }

  const _REQUEST_ID_PREFIX = 'qr-';

  // ─── App → Extension ─────────────────────────────────────────────────────────
  window.addEventListener('message', function (event) {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.source !== 'VCPMC_APP') return;

    var messageType = event.data.type;
    var requestId = event.data.requestId || (_REQUEST_ID_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    var payload = event.data.payload;

    // ── VCPMC_QR_HELPER_PING — used by checkExtensionAvailable() ───────────────
    if (messageType === 'VCPMC_QR_HELPER_PING') {
      chrome.runtime.sendMessage({ type: 'GET_QR_HELPER_STATUS' }).then(function (response) {
        if (chrome.runtime.lastError) {
          window.postMessage({
            source: 'VCPMC_QR_HELPER',
            type: 'VCPMC_QR_HELPER_RESPONSE',
            requestId: requestId,
            ok: false,
            error: 'EXTENSION_NOT_FOUND'
          }, '*');
          return;
        }
        window.postMessage({
          source: 'VCPMC_QR_HELPER',
          type: 'VCPMC_QR_HELPER_RESPONSE',
          requestId: requestId,
          ok: !!(response && response.ok),
          service: SERVICE_NAME,
          version: EXTENSION_VERSION,
          name: response.name || 'VCPMC QR Portal Assistant',
        }, '*');
      }).catch(function (err) {
        window.postMessage({
          source: 'VCPMC_QR_HELPER',
          type: 'VCPMC_QR_HELPER_RESPONSE',
          requestId: requestId,
          ok: false,
          error: 'EXTENSION_NOT_FOUND'
        }, '*');
      });
      return;
    }

    // ── VCPMC_QR_PORTAL_AUTO_ADD_AND_FILL — auto full flow ─────────────────────
    if (messageType === 'VCPMC_QR_PORTAL_AUTO_ADD_AND_FILL') {
      chrome.runtime.sendMessage({ type: 'SAVE_QR_PAYLOAD', payload: payload }).then(function () {
        chrome.runtime.sendMessage({ type: 'FILL_QR_PORTAL_POPUP' }).then(function (fillResponse) {
          window.postMessage({
            source: 'VCPMC_QR_HELPER',
            type: 'VCPMC_QR_HELPER_RESPONSE',
            requestId: requestId,
            ok: !!(fillResponse && fillResponse.ok),
            status: fillResponse ? (fillResponse.status || 'FILLED') : 'FAILED',
            message: fillResponse ? (fillResponse.message || '') : '',
            error_code: fillResponse ? (fillResponse.error_code || (fillResponse.ok ? null : 'FILL_FAILED')) : 'FILL_FAILED',
            error_message: fillResponse ? (fillResponse.error_message || null) : 'Fill response unavailable',
            stage: fillResponse ? (fillResponse.stage || 'FILL') : 'FILL',
            filled_fields: fillResponse ? (fillResponse.filled || []) : [],
            missing_fields: fillResponse ? (fillResponse.missing || []) : [],
            failed_fields: fillResponse ? (fillResponse.failed_fields || []) : [],
            selectSkipped: fillResponse ? (fillResponse.selectSkipped || []) : [],
            warnings: fillResponse ? (fillResponse.warnings || []) : [],
          }, '*');
        }).catch(function (err) {
          window.postMessage({
            source: 'VCPMC_QR_HELPER',
            type: 'VCPMC_QR_HELPER_RESPONSE',
            requestId: requestId,
            ok: false,
            status: 'FILL_FAILED',
            error_code: 'EXTENSION_ERROR',
            error_message: err.message || 'Fill call failed',
            stage: 'FILL',
          }, '*');
        });
      }).catch(function (err) {
        window.postMessage({
          source: 'VCPMC_QR_HELPER',
          type: 'VCPMC_QR_HELPER_RESPONSE',
          requestId: requestId,
          ok: false,
          status: 'SAVE_PAYLOAD_FAILED',
          error_code: 'EXTENSION_NOT_FOUND',
          error_message: err.message || 'Extension not found',
          stage: 'SAVE',
        }, '*');
      });
      return;
    }

    // ── QR_HELPER_GET_STATUS — get current fill status ─────────────────────────
    if (messageType === 'QR_HELPER_GET_STATUS') {
      chrome.storage.local.get('vcpmc_qr_status').then(function (result) {
        window.postMessage({
          source: 'VCPMC_QR_HELPER',
          type: 'VCPMC_QR_HELPER_RESPONSE',
          requestId: requestId,
          ok: true,
          status: result['vcpmc_qr_status'] || 'IDLE',
        }, '*');
      }).catch(function () {
        window.postMessage({
          source: 'VCPMC_QR_HELPER',
          type: 'VCPMC_QR_HELPER_RESPONSE',
          requestId: requestId,
          ok: true,
          status: 'IDLE',
        }, '*');
      });
      return;
    }

    // ── QR_PORTAL_OPEN_LOGIN_ONLY — step 1: login only ──────────────────────────
    if (messageType === 'QR_PORTAL_OPEN_LOGIN_ONLY') {
      chrome.runtime.sendMessage({ type: 'OPEN_PORTAL_LOGIN_ONLY', payload: payload }).then(function (response) {
        window.postMessage({
          source: 'VCPMC_QR_HELPER',
          type: 'VCPMC_QR_HELPER_RESPONSE',
          requestId: requestId,
          ok: !!(response && response.ok),
          status: response ? (response.status || 'PORTAL_LOGGED_IN_WAITING_FOR_FILL') : 'FAILED',
          message: response ? (response.message || '') : '',
          error_code: response ? (response.error_code || null) : 'OPEN_PORTAL_LOGIN_ONLY_FAILED',
          error_message: response ? (response.error_message || null) : null,
          stage: response ? (response.stage || 'LOGIN') : 'LOGIN',
        }, '*');
      }).catch(function (err) {
        window.postMessage({
          source: 'VCPMC_QR_HELPER',
          type: 'VCPMC_QR_HELPER_RESPONSE',
          requestId: requestId,
          ok: false,
          status: 'OPEN_PORTAL_LOGIN_ONLY_FAILED',
          error_code: 'EXTENSION_ERROR',
          error_message: err.message || 'Extension not found',
          stage: 'LOGIN',
        }, '*');
      });
      return;
    }

    // ── QR_PORTAL_OPEN_ADD_AND_FILL — step 2: open + fill ──────────────────────
    if (messageType === 'QR_PORTAL_OPEN_ADD_AND_FILL') {
      chrome.runtime.sendMessage({ type: 'SAVE_QR_PAYLOAD', payload: payload }).then(function () {
        chrome.runtime.sendMessage({ type: 'OPEN_PORTAL_ADD_AND_FILL' }).then(function (response) {
          window.postMessage({
            source: 'VCPMC_QR_HELPER',
            type: 'VCPMC_QR_HELPER_RESPONSE',
            requestId: requestId,
            ok: !!(response && response.ok),
            status: response ? (response.status || 'FILLED') : 'FAILED',
            message: response ? (response.message || '') : '',
            error_code: response ? (response.error_code || null) : 'FILL_FAILED',
            error_message: response ? (response.error_message || null) : null,
            stage: response ? (response.stage || 'FILL') : 'FILL',
            filled_fields: response ? (response.filled_fields || []) : [],
            missing_fields: response ? (response.missing_fields || []) : [],
          }, '*');
        }).catch(function (err) {
          window.postMessage({
            source: 'VCPMC_QR_HELPER',
            type: 'VCPMC_QR_HELPER_RESPONSE',
            requestId: requestId,
            ok: false,
            status: 'FILL_FAILED',
            error_code: 'EXTENSION_ERROR',
            error_message: err.message || 'Extension not found',
            stage: 'FILL',
          }, '*');
        });
      }).catch(function (err) {
        window.postMessage({
          source: 'VCPMC_QR_HELPER',
          type: 'VCPMC_QR_HELPER_RESPONSE',
          requestId: requestId,
          ok: false,
          status: 'SAVE_PAYLOAD_FAILED',
          error_code: 'EXTENSION_NOT_FOUND',
          error_message: err.message || 'Extension not found',
          stage: 'SAVE',
        }, '*');
      });
      return;
    }

    // ── SAVE_QR_PAYLOAD — legacy / popup uses this ──────────────────────────────
    if (messageType === 'SAVE_QR_PAYLOAD') {
      chrome.runtime.sendMessage({ type: 'SAVE_QR_PAYLOAD', payload: payload }).then(function (response) {
        window.postMessage({
          source: 'VCPMC_QR_HELPER',
          type: 'SAVE_QR_PAYLOAD_RESULT',
          ok: !!(response && response.ok)
        }, '*');
      }).catch(function (err) {
        window.postMessage({
          source: 'VCPMC_QR_HELPER',
          type: 'SAVE_QR_PAYLOAD_RESULT',
          ok: false,
          error: 'EXTENSION_NOT_FOUND'
        }, '*');
      });
      return;
    }
  });

  // ─── Forward responses from background (if needed) ────────────────────────────
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'VCPMC_QR_HELPER_SAVE_RESULT') {
      window.postMessage({
        source: 'VCPMC_QR_HELPER',
        type: 'SAVE_QR_PAYLOAD_RESULT',
        ok: !!(msg.ok)
      }, '*');
    }
  });

})();
