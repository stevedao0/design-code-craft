# Changelog v2.2

## Changed
- `manifest.json`: Them `host_permissions` cho `http://192.168.0.206:8000/*` va `http://192.168.0.206:5173/*` (IP noi bo may khach).
- Version tu `2.1` len `2.2`.

## Added
- `GET_QR_HELPER_STATUS` message handler trong background.js: Tra ve `{ ok, service, name, version, manifest_version }`.
- Day du cac message types trong content-app-bridge.js: `VCPMC_QR_HELPER_PING`, `VCPMC_QR_PORTAL_AUTO_ADD_AND_FILL`, `QR_HELPER_GET_STATUS`, `QR_PORTAL_OPEN_LOGIN_ONLY`, `QR_PORTAL_OPEN_ADD_AND_FILL`, `SAVE_QR_PAYLOAD`.
- `OPEN_PORTAL_LOGIN_ONLY` va `OPEN_PORTAL_ADD_AND_FILL` handlers trong background.js.

---

# Changelog v2.1

## Added
- Popup hoan chinh voi cac nut: Dien popup, Mo QR Portal, Kiem tra popup, Xem truoc du lieu, Sao chep log, Xoa du lieu tam.
- Bang mapping giua payload va truong popup.
- Ho tro quet popup (scan).
- Ho tro xem truoc mapping.
- Chi tiet ket qua fill bao gom danh sach truong da dien / bi loi / bi bo qua.

## No changed
- Khong tu bam Lưu.
- Khong goi API portal.
- Khong gui du lieu len server.

---

# Huong dan nap extension

1. Mo `chrome://extensions`
2. Bat **Developer mode** (goc trai tren)
3. Click **Load unpacked**
4. Chon thu muc `vcpmc-qr-helper-v2` (thu muc chua manifest.json)
5. Tim extension **VCPMC QR Portal Assistant**, click **Details**, keo xuong **Pin**
6. Mo app In GCN, gui du lieu sang QR Portal Assistant
7. Mo portal QR, bam **Them moi**
8. Bam icon extension tren thanh cong cu, bam **Diên vào popup đang mở**
9. Kiem tra du lieu tren popup, tu bam **Lưu**
