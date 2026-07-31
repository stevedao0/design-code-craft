// background.js — VCPMC QR Helper V2
// Luu payload tu app va phuc vu cho portal fill

const STORAGE_KEY = 'vcpmc_qr_payload_v2';
const EXTENSION_VERSION = '2.2';
const EXTENSION_NAME = 'VCPMC QR Portal Assistant';
const SERVICE_NAME = 'vcpmc-qr-helper';

// ─── Message routing ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── Extension status / version handshake ──────────────────────────────────
  if (msg.type === 'GET_QR_HELPER_STATUS') {
    sendResponse({
      ok: true,
      service: SERVICE_NAME,
      name: EXTENSION_NAME,
      version: EXTENSION_VERSION,
      manifest_version: 3,
    });
    return true;
  }

  if (msg.type === 'SAVE_QR_PAYLOAD') {
    chrome.storage.local.set({ [STORAGE_KEY]: msg.payload }).then(() => {
      sendResponse({ ok: true, received: true });
    });
    return true;
  }

  if (msg.type === 'GET_QR_PAYLOAD') {
    chrome.storage.local.get(STORAGE_KEY).then((result) => {
      sendResponse({ ok: true, payload: result[STORAGE_KEY] || null });
    });
    return true;
  }

  if (msg.type === 'CLEAR_QR_PAYLOAD') {
    chrome.storage.local.remove(STORAGE_KEY).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'FILL_QR_PORTAL_POPUP') {
    return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (!tabs[0]) return { ok: false, error: 'Khong tim thay tab.' };
      return chrome.tabs.sendMessage(tabs[0].id, { type: 'DO_FILL_QR_PORTAL' });
    });
  }

  if (msg.type === 'SCAN_QR_PORTAL_POPUP') {
    return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (!tabs[0]) return { ok: false, error: 'Khong tim thay tab.' };
      return chrome.tabs.sendMessage(tabs[0].id, { type: 'DO_SCAN_QR_PORTAL' });
    });
  }

  // ── Version handshake (v2.2) ────────────────────────────────────────────────
  if (msg.type === 'GET_QR_HELPER_STATUS') {
    sendResponse({
      ok: true,
      service: SERVICE_NAME,
      name: EXTENSION_NAME,
      version: EXTENSION_VERSION,
      manifest_version: 3,
    });
    return true;
  }

  // ── Portal auto-add-and-fill flow ───────────────────────────────────────────
  if (msg.type === 'OPEN_PORTAL_LOGIN_ONLY') {
    return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (!tabs[0]) return { ok: false, error: 'Khong tim thay tab.', stage: 'TAB_QUERY' };
      return chrome.tabs.sendMessage(tabs[0].id, { type: 'DO_OPEN_PORTAL_LOGIN_ONLY', payload: msg.payload });
    });
  }

  if (msg.type === 'OPEN_PORTAL_ADD_AND_FILL') {
    return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (!tabs[0]) return { ok: false, error: 'Khong tim thay tab.', stage: 'TAB_QUERY' };
      return chrome.tabs.sendMessage(tabs[0].id, { type: 'DO_OPEN_PORTAL_ADD_AND_FILL' });
    });
  }

  return false;
});
