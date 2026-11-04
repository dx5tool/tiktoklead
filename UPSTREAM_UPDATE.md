# Hướng Dẫn Cập Nhật Fury Upstream

Dự án này sử dụng kiến trúc phân tầng module hóa **"Ruột Fury - Vỏ Simprint"**:
- **Tầng lõi C++** (`core/` - Chromium patches, fingerprint spoofing canvas, webgl, audio): **Giữ nguyên 100% gốc**.
- **Tầng Rust Daemon & Tauri IPC** (`agent/`, `desktop/src-tauri/`): **Giữ nguyên 100% gốc**.
- **Tầng API Client** (`desktop/src/api.ts`): **Bảo tồn nguyên vẹn 100% chữ ký & kiểu dữ liệu**, không sửa đổi để ngăn ngừa rò rỉ fingerprint và đảm bảo CLI/Daemon hoạt động chính xác.
- **Tầng giao diện Simprint** (`desktop/src/components/simprint/`, `desktop/src/theme/`): Tách biệt hoàn toàn trong thư mục riêng, chỉ nhận dữ liệu từ `App.tsx`.

> **Trạng thái hiện tại (04.11.2026):** nhánh `custom/simprint-ui` đã merge upstream `v0.4.20`. Farm schedule, WireGuard, Team/server, core `0.4.14` và các fix bảo mật đã có trong source. Updater đã tách khỏi upstream bằng placeholder — xem mục 5.

---

## 1. Cấu Hình Git Remote (Chỉ cần làm 1 lần)

Đảm bảo repository đã có 2 remote:
- `origin`: Repository cá nhân hoặc tổ chức của bạn.
- `upstream`: Repository chính thức của Fury (`https://github.com/furyteamtop/fury-antidetect-browser.git`).

Kiểm tra bằng lệnh:
```bash
git remote -v
```

Nếu chưa có remote `upstream`, thêm bằng lệnh:
```bash
git remote add upstream https://github.com/furyteamtop/fury-antidetect-browser.git
```

---

## 2. Quy Trình Cập Nhật Khi Fury Ra Bản Mới (Ví dụ: v0.3.10, v0.4.0)

Khi Fury phát hành bản vá bảo mật hoặc tính năng C++ mới:

### Bước 2.1: Fetch dữ liệu mới nhất từ Upstream
```bash
git fetch upstream
```

### Bước 2.2: Đồng bộ nhánh chính (main)
```bash
git checkout main
git merge upstream/main
git push origin main
```

### Bước 2.3: Cập nhật nhánh giao diện `custom/simprint-ui`
Chuyển về nhánh giao diện và thực hiện rebase:
```bash
git checkout custom/simprint-ui
git rebase upstream/main
```
*(Hoặc dùng `git merge upstream/main` nếu bạn ưu tiên merge commit)*

> **Không còn zero-conflict từ 0.4.20.**
> `desktop/src/App.tsx` bị cả hai bên sửa, nên merge sẽ xung đột. `tauri.conf.json`, `capabilities/default.json`, `package-lock.json` cũng xung đột. Giữ phần JSX Simprint trong `App.tsx`, chỉ thêm hook/effect/JSX mới của upstream; xem mục 4.

---

## 3. Kiểm Tra & Xác Minh Sau Khi Cập Nhật

1. **Cài đặt lại dependency nếu upstream có thay đổi**:
   ```bash
   cd desktop
   npm install
   ```

2. **Kiểm tra TypeScript & Vite Build**:
   ```bash
   npm run build
   ```
   Lệnh cần kết thúc thành công với `0 errors`.

3. **Chạy thử chế độ Dev Browser**:
   ```bash
   npm run dev
   ```
   Mở trình duyệt tại `http://localhost:5273` để kiểm tra:
   - Hiệu ứng Cyber Grid + Radial Glow + Micro-noise trên nền Canvas.
   - Trạng thái chấm xanh `Agent Online`.
   - Chuyển đổi giữa Table View (Dạng Bảng) và Grid View (Dạng Thẻ).
   - Phím tắt `Ctrl+K` và thanh dock hành động hàng loạt (Bulk Bar).

4. **Chạy thử ứng dụng Native Tauri**:
   ```bash
   npm run app
   ```
   Khởi chạy và mở profile để kiểm tra trình duyệt Chromium tùy biến của Fury mở mượt mà và vượt qua các trang kiểm tra fingerprint (`browserleaks.com`, `iphey.com`).

---

## 4. Merge 0.4.20 — các điểm phải giữ

Merge `upstream-v0.4.20` vào `custom/simprint-ui`, rồi xử lý:

- **`desktop/src/App.tsx`**: giữ JSX Simprint. Lấy từ upstream các hook/effect mới:
  - `farms`, `farmDue/farmClaim/farmFail/farmStageApplied`, bar kế hoạch farm;
  - `settingsTab` + `initialTab` cho Settings;
  - thông báo server cần update (`OUR_SERVERS`, `versionNewer`);
  - `saveStage` cho farm;
  - prop `version={shell.version}` cho Login/Enrol/Signup/ServerSetup.
  Không lấy block toolbar upstream (đã có `SimprintHeader`/`SimprintBulkBar`).
- **Call site đổi prop**:
  - `Proxies`: thêm `local` và `myEmail`.
  - `Users`: thêm `serverUrl`; `onConnect` mở Settings tab `team`.
  - `Settings`: thêm `initialTab={settingsTab}`.
  - `WarmDialog`/`api.warmStart`: nhận `{ id, origin }[]` thay vì `string[]`.
- **`capabilities/default.json`**: hợp nhất quyền cửa sổ hiện có với `core:window:allow-set-theme`.
- **`tauri.conf.json`**: giữ `decorations: false` cho titlebar Simprint; giữ block updater placeholder; quyết định `theme` (giữ `Dark` nếu muốn native dialog tối).
- **`package-lock.json`**: chạy `npm install` để tái tạo.
- **`SimprintSidebar.tsx`**: dùng `shell.version` thay cho `v0.3.9` hardcode.
- Test: `npm run build`, `cargo check -p fury-agent -p fury-desktop -p fury-server`, mở app kiểm tra Profiles/Farm/WireGuard/Users.

## 5. Updater riêng của fork

Hiện tại:

- `desktop/src-tauri/tauri.conf.json` → `plugins.updater.pubkey` là key ngẫu nhiên, endpoint `https://updates.simprint.invalid/latest.json`.
- `desktop/src-tauri/src/update.rs` → `RELEASES` trỏ repo placeholder `simprint-placeholder/fury-simprint`.

Đây là placeholder có chủ đích: không báo update upstream và không thể cài bản official. Muốn phát hành thật:

1. `cd desktop && npx tauri signer generate -w ~/.tauri/fury-simprint.key`
2. Đưa public key vào `tauri.conf.json`; build với `TAURI_SIGNING_PRIVATE_KEY`.
3. Sửa `RELEASES` và endpoint cùng lúc, trỏ về repo release của fork.
4. Sửa `tools/release/updater-feed.sh` (đang hardcode repo upstream), `Cargo.toml` repository và `tools/ci/check-repo-url.py` nếu chạy CI.
5. Core download vẫn trỏ upstream trong `agent/src/core_download.rs`; đổi nếu muốn host core riêng.
