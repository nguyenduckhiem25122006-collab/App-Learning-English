# Nhịp – mã nguồn

Cấu trúc:
- `data/` – nguồn dữ liệu dạng văn bản: `kids*.txt`, `toeic*.txt` (từ|loại từ|nghĩa|ví dụ|hình), `sent_*.txt` (câu giao tiếp hằng ngày, công sở và cấu trúc câu TOEIC LR & SW), `ipa.json` (44 âm).
- `build_data.py` – gắn IPA (từ điển CMU), kiểm tra trùng lặp, xuất `build/data.js`.
- `src/core.js` – logic thuần (lịch ôn tập Leitner, chuỗi ngày, quiz) dùng chung cho app và test.
- `src/farm.js` – logic nông trại (cây trồng, vật nuôi, đơn hàng, nhà kho, trang trí); xu kiếm được từ việc học.
  Giới hạn chơi (`GATE`): 1 phút học = 0,75 phút chơi, cần học tối thiểu 10 phút, lượt làm mới sau 5 tiếng.
- `src/app.js`, `src/index.html` – giao diện.
- `src/online.js`, `src/online.config.js` – bảng xếp hạng lớp (Supabase); `supabase/schema.sql` – máy chủ. Hướng dẫn bật: **ONLINE.md**.
- `src/img/beasts/` – ảnh 12 Linh Thú (cắt từ ảnh 12 con giáp).
- `build_app.py` – ghép thành `dist/nhip.html` (1 file) và `dist/nhip-pwa.zip` (bản cài đặt offline).
- `tests/` – `node --test tests/*.test.js` (unit + dữ liệu), `python3 tests/e2e_test.py` (Playwright).

Build:
    pip install cmudict pillow playwright && python3 build_data.py && python3 build_app.py

Test:
    python3 build_data.py && node --test tests/*.test.js     # unit (core, nông trại) + kiểm tra dữ liệu
    python3 build_app.py && python3 tests/e2e_test.py        # 75 kiểm tra trên Chromium
    cd tests && python3 sql_test.py && python3 online_test.py  # máy chủ trên PostgreSQL thật + 10–16 người dùng (cần PostgreSQL, psycopg)

Phiên bản `playwright` (pip) phải khớp với Chromium đã cài (`playwright install chromium`).

Kết quả: `dist/nhip.html` mở trực tiếp bằng trình duyệt; `dist/pwa/` là bản cài đặt offline (đưa lên GitHub Pages/Netlify).

Thêm từ mới: thêm dòng vào `data/*.txt`, chạy lại 2 lệnh build và bộ test.

Đưa lên web (GitHub Pages):
    Mỗi lần push lên nhánh `main`, workflow `.github/workflows/pages.yml` tự build và đăng `dist/pwa`.
    Link: https://nguyenduckhiem25122006-collab.github.io/App-Learning-English/
