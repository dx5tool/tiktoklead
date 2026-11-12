# XCHANGE ANTIDETECT BROWSER — SIMPRINT UI REDESIGN
> **Tài liệu Handoff & Kiến Trúc Dự Án dành cho AI LLM / Developer tiếp quản**  
> *Phiên bản: v1.4.21 | Nhánh: `xchange` | Cập nhật gần nhất: 12/11/2026*
>
> Đã merge upstream XChange `v0.4.20`: Farm schedule, WireGuard, Team/server, core `0.4.14` và các fix bảo mật đã có trong source. Giao diện Simprint được giữ nguyên.
>
> **12.11.2026:** đã port các tính năng upstream `0.5.0–0.5.3` (Bookmark Sets, cờ quốc gia proxy, 12 ngôn ngữ, Google session portable, proxy password/rotation, open-on-start, deviceMemory 8GB, per-server org key, Tauri 2.12). Core vẫn `155.0.8059.39` và giữ patch `0071-webrtc-candidates`.

---

## 1. TỔNG QUAN DỰ ÁN

### 1.1. XChange Antidetect Browser là gì?
XChange (gốc: [dx5tool/fury-nomaster](https://github.com/dx5tool/fury-nomaster)) là trình duyệt chống phát hiện danh tính (Antidetect Browser) mã nguồn mở cấp độ doanh nghiệp dành cho đội ngũ (teams) và cá nhân. Fork hiện phát hành tại [dx5tool/tiktoklead](https://github.com/dx5tool/tiktoklead), nhánh `xchange`:
- **Tầng Chromium C++ (`core/`)**: Bản vá sâu vào Chromium Core để can thiệp giả lập vân tay trình duyệt phần cứng: Canvas spoofing, WebGL vendor/renderer, AudioContext latency, Client Rects, User-Agent, Navigator, Fonts, v.v. (không dùng extension injection để tránh bị phát hiện).
- **Tầng Daemon Rust (`agent/`)**: Daemon tiến trình `xchange-agent` chạy ngầm quản lý profiles, proxy routing (HTTP/SOCKS5/WireGuard), cookie jar, profile lock heartbeat và thực hiện CLI automation.
- **Tầng Desktop Shell (`desktop/`)**: Ứng dụng desktop xây dựng trên **Tauri v2 + React 19 + TypeScript + Vite**.

### 1.2. Mục tiêu nhánh `custom/simprint-ui`
Tân trang toàn bộ giao diện Desktop sang phong cách **Studio / Cyberpunk Hiện đại của Simprint** ([Simprint/simprint](https://github.com/Simprint/simprint)), mang lại trải nghiệm tối giản, cao cấp, hỗ trợ cả **Dạng Bảng (Table View)** và **Dạng Thẻ (Grid View)**, thanh tiêu đề tùy biến frameless kèm Breadcrumb và menu tài khoản tiện dụng.

---

## 2. NGUYÊN TẮC BẤT BIẾN CỐT LÕI (CRITICAL INVARIANTS)

Bất kỳ AI LLM hoặc Developer nào chỉnh sửa dự án này **BẮT BUỘC** phải tuân thủ nghiêm ngặt các nguyên tắc sau:

1. **BẢO TỒN NGUYÊN VẸN 100% TẦNG LÕI BẢO MẬT**:
   - **Tuyệt đối KHÔNG sửa đổi** các thư mục C++ Core (`core/`), Rust Agent (`agent/`), Rust Server (`server/`), và `shared-rs/`.
   - Mọi cơ chế chống phát hiện danh tính đều nằm ở C++ và Rust. Sửa đổi bừa bãi sẽ làm rò rỉ fingerprint hoặc hỏng cơ chế sandbox của Chromium.
2. **`desktop/src/api.ts` LÀ ANCHOR BẤT BIẾN (IMMUTABLE)**:
   - **Tuyệt đối KHÔNG thay đổi** chữ ký hàm, interfaces, types hoặc RPC methods trong file này. File này giao tiếp trực tiếp qua Tauri IPC tới `xchange-agent`. Bất kỳ thay đổi tham số nào đều có thể dẫn đến lộ lọt thông tin qua CLI hoặc crash daemon.
3. **KIẾN TRÚC "RUỘT XCHANGE - VỎ SIMPRINT" (ZERO-CONFLICT UPSTREAM UPDATE)**:
   - Toàn bộ giao diện Simprint được cô lập hoàn toàn trong:
     - `desktop/src/components/simprint/`
     - `desktop/src/theme/simprint-tokens.css`
   - File điều phối `desktop/src/App.tsx` chỉ đóng vai trò ghép nối state của XChange vào các views Simprint. Khi upstream XChange ra bản phát hành mới (0.3.10, 0.4.0...), việc `git rebase upstream/main` sẽ tự động thành công (Zero Conflict).

---

## 3. KIẾN TRÚC HỆ THỐNG & CẤU TRÚC THƯ MỤC

```
E:/SOURCE_CODE/XCHANGE/
├── core/                         # [BẤT BIẾN] Mã nguồn patch Chromium C++
├── agent/                        # [BẤT BIẾN] Daemon Rust xchange-agent
├── server/                       # [BẤT BIẾN] Backend sync team server
├── shared-rs/                    # [BẤT BIẾN] Thư viện Rust dùng chung
├── UPSTREAM_UPDATE.md            # Tài liệu hướng dẫn cập nhật từ repo gốc
├── PROJECT_OVERVIEW.md           # [FILE NÀY] Tài liệu tổng quan kiến trúc
│
└── desktop/                      # Tầng giao diện người dùng Desktop
    ├── package.json              # Khai báo React 19, Tailwind v4, Lucide React
    ├── vite.config.ts            # Cấu hình Vite + Tailwind v4 plugin + proxy /v1
    │
    ├── src-tauri/                # Tầng Tauri v2 Backend
    │   ├── Cargo.toml            # Cấu hình Rust crate xchange-desktop
    │   ├── tauri.conf.json       # "decorations": false (Frameless), externalBin: xchange-agent
    │   ├── capabilities/
    │   │   └── default.json      # Khai báo quyền Tauri ACL (drag, minimize, maximize, close)
    │   └── binaries/             # Thư mục chứa Sidecar Binary (được .gitignore)
    │       └── xchange-agent-x86_64-pc-windows-msvc.exe
    │
    └── src/                      # Frontend React 19 + TypeScript
        ├── api.ts                # [BẤT BIẾN] API client IPC giao tiếp daemon
        ├── styles.css            # Styles toàn cục (.app flex-col, Tailwind v4, tokens)
        ├── App.tsx               # Orchestrator chính: điều phối data XChange vào view Simprint
        │
        ├── theme/
        │   └── simprint-tokens.css # Hệ thống màu Cyberpunk Slate, Glassmorphism, Modal, Terminal
        │
        └── components/simprint/  # [KHU VỰC GIAO DIỆN SIMPRINT ĐỘC LẬP]
            ├── AppBackground.tsx       # Canvas kép: Lưới vi mô 6px, chấm 24px, noise, radial glow
            ├── SimprintTitlebar.tsx    # Thanh tiêu đề Frameless: Kéo cửa sổ, Breadcrumbs, User Menu
            ├── SimprintSidebar.tsx     # Sidebar: Hỗ trợ Expand / Collapse, Agent Online pulse
            ├── SimprintHeader.tsx      # Header scoped (Profiles): Ctrl+K search, Table/Grid toggle
            ├── SimprintProfileTable.tsx# Table View: Virtualized Windowing mượt mà >150 rows
            ├── SimprintProfileGrid.tsx # Grid Cards View: Giao diện thẻ trực quan Cyberpunk
            ├── SimprintBulkBar.tsx     # Dock nổi bottom bar cho thao tác hàng loạt
            ├── SimprintBadge.tsx       # Tag/Pill badges đa màu (Cyan/Emerald/Amber/Rose/Slate)
            └── utils.ts                # Utility cn() (clsx + tailwind-merge)
```

---

## 4. CHI TIẾT CÁC TÍNH NĂNG ĐÃ TRIỂN KHAI

### 4.1. Thanh Tiêu Đề Hợp Nhất (Simprint Unified Titlebar) — `SimprintTitlebar.tsx`
- **Frameless Window**: Đặt `"decorations": false` trong `tauri.conf.json`. Thanh tiêu đề Simprint trở thành thanh điều khiển duy nhất của cửa sổ.
- **Kéo Rê & Phóng To Cửa Sổ (Window Drag & Maximize)**:
  - Tích hợp `data-tauri-drag-region`, sự kiện `onMouseDown` gọi `getCurrentWindow().startDragging()` và `onDoubleClick` gọi `toggleMaximize()`.
  - Cụm nút chuẩn Desktop góc phải: Thu nhỏ (`—`), Phóng to / Khôi phục (`▢`), Đóng (`✕` hover đỏ).
- **Breadcrumb Navigation**:
  - `Home` $\rightarrow$ `>` $\rightarrow$ Icon chuyên mục (`Profiles`, `Proxies`, `Extensions`, v.v.) $\rightarrow$ Thư mục dự án đang chọn.
- **Menu Người Dùng Dropdown (`Local User`)**:
  - Tự động đóng khi click ra ngoài (`outside click handler`).
  - Danh mục: *Account & Security, General, Browser & Automation, Network & Sync, Storage & Update, Workspace, Team*.
  - **Submenu `Language`**: Chuyển đổi ngôn ngữ giao diện tức thì (*English, Русский, System*).
  - **Submenu `Theme`**: Highlight nền xanh, chuyển đổi theme tức thì (*Light, Dark, System*).
  - **Switch User**: Nút thoát phiên màu đỏ.

### 4.2. Thanh Sidebar Thu Gọn / Mở Rộng (Collapsible Sidebar) — `SimprintSidebar.tsx`
- **Nút Toggle**: Nằm cạnh logo trên thanh tiêu đề (`PanelLeftClose` / `PanelLeft`).
- **Trạng thái Mở rộng (Expanded - 256px)**: Đầy đủ nhãn, cây thư mục Local/Team kèm context menu chuột phải, nút `+ New Profile` gradient.
- **Trạng thái Thu gọn (Collapsed - 64px)**: Co lại thành thanh icon tinh gọn căn giữa, nút `+ New Profile` icon vuông, tooltip chú thích khi hover.
- **Lưu trạng thái**: Tự động lưu `xchange.sidebar_collapsed` vào `localStorage`.
- **Loại bỏ trùng lặp**: Đã xóa hoàn toàn khối logo thừa "XCHANGE STUDIO" dưới sidebar để tránh trùng với thanh tiêu đề.

### 4.3. Thanh Tìm Kiếm & Công Cụ Có Phạm Vi (Scoped Profile Toolbar) — `SimprintHeader.tsx`
- **Chỉ hiển thị tại trang Profiles**: Ô tìm kiếm `Search by name... (Ctrl K)`, `Open (0)`, `Several profiles...`, `Import CSV`, `GoLogin Import`, `Refresh` chỉ render khi `view === "profiles"` hoặc `"sharedWithMe"`.
- **Tự động ẩn trên các trang khác**: Khi chuyển sang `Proxies`, `Extensions`, `AI assistants`, `Users`, `Trash`, thanh tìm kiếm profile tự động ẩn để giữ giao diện sạch sẽ.

### 4.4. Chế Độ Xem Kép: Dạng Bảng & Dạng Thẻ (Table vs Grid View)
- Chuyển đổi linh hoạt thông qua nút segmented toggle trên Header, lưu tùy chọn vào `localStorage.getItem("xchange.view_mode")`:
  - **Table View (`SimprintProfileTable.tsx`)**: Giữ nguyên Virtual Windowing (`WINDOW_FROM = 150`, `BUFFER = 20`) để cuộn mượt mà hàng ngàn profile mà không tràn DOM. Nút Launch/Stop với spinner `Loader2`.
  - **Grid View (`SimprintProfileGrid.tsx`)**: Hiển thị dạng thẻ Card Cyberpunk 1-4 cột responsive, hiển thị thông số giả lập Chrome/XChange Core, khối proxy thu nhỏ, tag con nhộng.

### 4.5. Thanh Dock Thao Tác Hàng Loạt (Floating Bulk Dock) — `SimprintBulkBar.tsx`
- Tự động trượt lên ở đáy màn hình khi chọn từ 1 profile trở lên:
  - Mở tất cả (`Launch Selected`), Đóng tất cả (`Close Selected`), Chuyển thư mục (`Move to Folder`), Gán proxy tự động (`Assign Proxy`), Warm cookies, Đồng bộ phím gõ (`Mirror Typing`), Gửi lên Server (`Upload to Team`), Xóa hàng loạt.

### 4.6. Nền Canvas Đồ Họa Cyberpunk — `AppBackground.tsx`
- Sử dụng thuật toán HTML5 Canvas kép:
  - Canvas 1: Lưới vi mô 6px, ma trận chấm tọa độ 24px, lớp tactile micro-noise.
  - Canvas 2: Hai quầng sáng radial glow ở góc dưới trái (Cyan) và góc dưới phải (Sky Blue) với hiệu ứng blur.
  - Tự động scale theo DPR và lắng nghe sự kiện resize cửa sổ.

---

## 5. HƯỚNG DẪN BIÊN DỊCH VÀ KHỞI CHẠY (DEVELOPER WORKFLOW)

### 5.1. Phân biệt: Khi nào cần Rebuild C++ vs. Khi nào chỉ cần Hot-Reload

| Tình huống | Loại thay đổi | Cách chạy & Thời gian phản hồi | Có cần MSVC C++ Compiler không? |
| :--- | :--- | :--- | :--- |
| **Sửa giao diện UI** | Mọi file trong `desktop/src/` (TSX, CSS, theme tokens, icon, text) | **Chỉ cần Hot-Reload** (`run-app.bat` hoặc `npm run dev`). Phản hồi trong **~50ms**. | ❌ **KHÔNG CẦN**. Vite HMR tự động đẩy code mới vào app đang chạy. |
| **Thêm thư viện React** | Thêm packages frontend trong `desktop/package.json` | Chạy `npm install` rồi chạy `run-app.bat`. | ❌ **KHÔNG CẦN**. |
| **Sửa tầng Rust/Tauri** | Sửa file trong `desktop/src-tauri/` (commands, permissions, icons) | **Bắt buộc Rebuild**: Chạy `run-app.bat rebuild` hoặc `npm run app`. | ✅ **BẮT BUỘC CẦN**. Cần MSVC C++ & Windows 11 SDK. |
| **Sửa Daemon/Core** | Sửa file trong `agent/`, `server/`, `shared-rs/` | **Bắt buộc Rebuild**: Chạy `cargo build -p xchange-agent`. | ✅ **BẮT BUỘC CẦN**. |
| **Sau khi `cargo clean`** | Xóa sạch thư mục `target/` hoặc clone máy mới | **Bắt buộc Rebuild**: Biên dịch lại toàn bộ Rust binaries từ con số 0. | ✅ **BẮT BUỘC CẦN**. |

### 5.2. Yêu cầu môi trường
- **Hệ điều hành**: Windows 10/11 x64 (hoặc macOS/Linux).
- **Node.js**: v20+ trở lên & `npm`.
- **Rust Toolchain**: `rustc` và `cargo` v1.80+ (cài qua `rustup`).
- **C++ Toolchain (chỉ khi rebuild native)**: Visual Studio MSVC C++ Build Tools + Windows 11 SDK (`10.0.26100.0`).

### 5.3. Cách khởi chạy nhanh nhất (Khuyên dùng)
Chỉ cần nhấp đúp file:
👉 **`desktop/run-app.bat`**
- **Chế độ mặc định (Fast Launch)**: Nhận diện bản build `.exe` có sẵn, bật server Vite ở cổng 5273 và mở ứng dụng trong **1.5 giây**. Khi bạn sửa file `.tsx` hay `.css`, giao diện tự động cập nhật ngay trên cửa sổ.
- **Chế độ Rebuild lại từ đầu**: Gõ `desktop\run-app.bat rebuild`. Script sẽ tự động nạp môi trường MSVC C++ (`vcvars64.bat`) và gọi `tauri dev` biên dịch lại.

### 5.4. Kiểm tra Typecheck và Build Production Frontend
```bash
cd desktop
npm run build
```
*(Yêu cầu kết thúc với `0 errors`)*.
---

## 6. QUY TRÌNH ĐỒNG BỘ UPSTREAM (ZERO-CONFLICT UPDATE)

Khi tác giả XChange ra bản cập nhật mới (ví dụ v0.3.10):
```bash
# 1. Lấy mã nguồn mới nhất từ upstream
git fetch upstream

# 2. Cập nhật nhánh main
git checkout main
git merge upstream/main

# 3. Rebase các thay đổi giao diện Simprint lên trên bản mới
git checkout custom/simprint-ui
git rebase upstream/main

# 4. Kiểm tra lại build
cd desktop
npm install
npm run build
```
Do tầng lõi C++/Rust và `desktop/src/api.ts` không bị can thiệp, Git rebase sẽ tự động áp dụng sạch sẽ các commit giao diện mà không gặp bất kỳ xung đột nào.

---

## 7. CHECKLIST CẦN NHỚ CHO CÁC LLM / MAINTAINERS TIẾP THEO

- [ ] **KHÔNG BAO GIỜ** sửa đổi `desktop/src/api.ts`.
- [ ] **KHÔNG BAO GIỜ** thêm style cố định đè lên `.app` mà phá vỡ `display: flex !important; flex-direction: column !important;` (sẽ làm vỡ layout toàn màn hình của Titlebar).
- [ ] Khi thêm component giao diện mới, đặt toàn bộ vào `desktop/src/components/simprint/`.
- [ ] Khi sử dụng biến màu, sử dụng các token từ `desktop/src/theme/simprint-tokens.css` (`--simprint-cyan`, `--simprint-bg`, `--simprint-surface`, v.v.).
- [ ] Khi cần quyền cửa sổ Tauri mới, khai báo trong `desktop/src-tauri/capabilities/default.json`.
