# Hướng Dẫn Cập Nhật Fury Upstream (Zero-Conflict Update Guide)

Dự án này sử dụng kiến trúc phân tầng module hóa **"Ruột Fury - Vỏ Simprint"**:
- **Tầng lõi C++** (`core/` - Chromium patches, fingerprint spoofing canvas, webgl, audio): **Giữ nguyên 100% gốc**.
- **Tầng Rust Daemon & Tauri IPC** (`agent/`, `desktop/src-tauri/`): **Giữ nguyên 100% gốc**.
- **Tầng API Client** (`desktop/src/api.ts`): **Bảo tồn nguyên vẹn 100% chữ ký & kiểu dữ liệu**, không sửa đổi để ngăn ngừa rò rỉ fingerprint và đảm bảo CLI/Daemon hoạt động chính xác.
- **Tầng giao diện Simprint** (`desktop/src/components/simprint/`, `desktop/src/theme/`): Tách biệt hoàn toàn trong thư mục riêng, chỉ nhận dữ liệu từ `App.tsx`.

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

> **Tại sao không bị xung đột (Zero Conflict)?**
> Toàn bộ các component giao diện Simprint nằm trong thư mục độc lập `desktop/src/components/simprint/` và `desktop/src/theme/`. Các file C++, Rust và `desktop/src/api.ts` không hề bị can thiệp, do đó Git sẽ tự động áp dụng các commit mà không gặp xung đột mã nguồn ở các tầng lõi.

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
