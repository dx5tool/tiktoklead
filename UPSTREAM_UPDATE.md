# Hướng Dẫn Cập Nhật XChange Upstream

Dự án này sử dụng kiến trúc phân tầng module hóa **"Ruột XChange - Vỏ Simprint"**:
- **Tầng lõi C++** (`core/` - Chromium patches, fingerprint spoofing canvas, webgl, audio): **Giữ nguyên 100% gốc**.
- **Tầng Rust Daemon & Tauri IPC** (`agent/`, `desktop/src-tauri/`): **Giữ nguyên 100% gốc**.
- **Tầng API Client** (`desktop/src/api.ts`): **Bảo tồn nguyên vẹn 100% chữ ký & kiểu dữ liệu**, không sửa đổi để ngăn ngừa rò rỉ fingerprint và đảm bảo CLI/Daemon hoạt động chính xác.
- **Tầng giao diện Simprint** (`desktop/src/components/simprint/`, `desktop/src/theme/`): Tách biệt hoàn toàn trong thư mục riêng, chỉ nhận dữ liệu từ `App.tsx`.

> **Trạng thái hiện tại (04.11.2026):** nhánh `custom/simprint-ui` đã merge upstream `v0.4.20`. Farm schedule, WireGuard, Team/server, core `0.4.14` và các fix bảo mật đã có trong source. Updater đã tách khỏi upstream bằng placeholder — xem mục 5.

> **Đổi tên Fury → XChange (12.11.2026).** Toàn bộ bề mặt người dùng, tên crate/binary, docs và tên file đã đổi sang XChange. **Khi rebase upstream, KHÔNG đổi ngược các chuỗi dưới đây về Fury** — chúng không phải nhãn sản phẩm mà là giao thức với core Chromium đã build sẵn.

## 0. Vùng BẤT BIẾN — không được "dọn" về XChange

Đổi bất kỳ mục nào dưới đây sẽ làm **hỏng tính năng**, không chỉ sai tên:

| Vùng | Vị trí | Vì sao phải giữ `fury` |
|---|---|---|
| `core/` toàn bộ | `core/patches/**`, `core/build/**`, `core/verify/**` | `FuryConfig`, `components/fury/`, `IS_FURY_IMPL`, `PRODUCT_SHORTNAME=Fury`, `MAC_BUNDLE_ID=dev.fury.core`, `kFuryKeyTag="f10"`. Core đã build sẵn; sửa patch là phải build lại 134 MB |
| Switch truyền fingerprint | `agent/src/launcher.rs` (`carrier_switches`), `platform-rs/src/carrier.rs` | Core đọc `--fury-fp-fd`, `--fury-fp-file-handle`, `--fury-oscrypt-*`, `--fury-lock-devtools`, `--fury-lock-data-export`. Đổi stem → **browser không nhận persona, không báo lỗi** |
| Env var `FURY_*` | toàn repo (69 biến) | `FURY_HOME`, `FURY_CORE`, `FURY_SERVER`, `FURY_OPEN_SIGNUP`, `FURY_SMTP_URL`, `FURY_MAX_*`, `FURY_VERSION`, … |
| Crypto / định dạng dữ liệu | `shared-rs/src/keys.rs`, `agent/src/vault.rs`, `desktop/src-tauri/src/crypto.rs` | `fury-seal-v1`, `fury-profile-v1`, `fury-oscrypt-v1`, `fury-oscrypt-id-v1`, `fury:ork1:`, `fury:v1:`, `fury verify code v1`. Đổi → **toàn bộ dữ liệu đã mã hoá không mở được** |
| Magic number file | `agent/src/bundle.rs` (`FURY-BN1`), `agent/src/transfer.rs` (`FURY-EX1/EX2`) | Định dạng bundle và file export. Đổi → file cũ không đọc được |
| Dụng cụ đo fingerprint | `tools/detect-suite/probe.js`, `sw-probe.js`, `probe.html` | Chữ `'Fury <canvas> …'` vẽ lên canvas quyết định `canvasHash`/`textMetrics`/`clientRects`. Đổi → **lệch toàn bộ baseline đã commit, gate CI đỏ** |
| Đường dẫn dò core | `agent/src/main.rs` (`core_leaves`), `widevine.rs`, `dock.rs` | `Fury.app/Contents/MacOS/Fury`, `Fury/chrome.exe`, `Fury/fury.exe`. Tên thật bên trong archive core |
| Bundle id core | `agent/src/dock.rs`, docs | `dev.fury.core` — nằm trong Info.plist đã ký |
| Sản phẩm khác | `site/index.html`, `desktop/src/components/Settings.tsx` | `SEO Fury` / `seo-fury.com` — sản phẩm khác của cùng tác giả |
| Danh tính git | `tools/ci/check-commit-identity.py` | `furyteamtop@users.noreply.github.com` — tài khoản GitHub thật |

**Kiểm chứng sau mỗi lần rebase:**
```bash
cargo run -q -p xchange-shared --example derive -- shared/personas/windows-11-rtx4060-1920x1080.json 123456789
git status --porcelain core/ tools/detect-suite/probe.js tools/detect-suite/sw-probe.js   # phải rỗng
```

---

## 1. Cấu Hình Git Remote (Chỉ cần làm 1 lần)

Đảm bảo repository đã có 2 remote:
- `origin`: Repository cá nhân hoặc tổ chức của bạn.
- `upstream`: Repository chính thức của XChange (`https://github.com/dx5tool/fury-nomaster.git`).

Kiểm tra bằng lệnh:
```bash
git remote -v
```

Nếu chưa có remote `upstream`, thêm bằng lệnh:
```bash
git remote add upstream https://github.com/dx5tool/fury-nomaster.git
```

---

## 2. Quy Trình Cập Nhật Khi XChange Ra Bản Mới (Ví dụ: v0.3.10, v0.4.0)

Khi XChange phát hành bản vá bảo mật hoặc tính năng C++ mới:

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
   Khởi chạy và mở profile để kiểm tra trình duyệt Chromium tùy biến của XChange mở mượt mà và vượt qua các trang kiểm tra fingerprint (`browserleaks.com`, `iphey.com`).

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
- Test: `npm run build`, `cargo check -p xchange-agent -p xchange-desktop -p xchange-server`, mở app kiểm tra Profiles/Farm/WireGuard/Users.

## 5. Updater riêng của fork

Hiện tại:

- `desktop/src-tauri/tauri.conf.json` → `plugins.updater.pubkey` là key ngẫu nhiên, endpoint `https://updates.simprint.invalid/latest.json`.
- `desktop/src-tauri/src/update.rs` → `RELEASES` trỏ repo placeholder `dx5tool/fury-nomaster`.

Đây là placeholder có chủ đích: không báo update upstream và không thể cài bản official. Muốn phát hành thật:

1. `cd desktop && npx tauri signer generate -w ~/.tauri/xchange-simprint.key`
2. Đưa public key vào `tauri.conf.json`; build với `TAURI_SIGNING_PRIVATE_KEY`.
3. Sửa `RELEASES` và endpoint cùng lúc, trỏ về repo release của fork.
4. Sửa `tools/release/updater-feed.sh` (đang hardcode repo upstream), `Cargo.toml` repository và `tools/ci/check-repo-url.py` nếu chạy CI.
5. Core download vẫn trỏ upstream trong `agent/src/core_download.rs`; đổi nếu muốn host core riêng.
