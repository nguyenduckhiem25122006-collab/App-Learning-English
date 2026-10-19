# Nhịp – mã nguồn

Cấu trúc:
- `data/` – nguồn dữ liệu dạng văn bản: `kids*.txt`, `toeic*.txt` (từ|loại từ|nghĩa|ví dụ|hình), `sent_*.txt` (câu giao tiếp), `ipa.json` (44 âm).
- `build_data.py` – gắn IPA (từ điển CMU), kiểm tra trùng lặp, xuất `build/data.js`.
- `src/core.js` – logic thuần (lịch ôn tập Leitner, chuỗi ngày, quiz) dùng chung cho app và test.
- `src/app.js`, `src/index.html` – giao diện.
- `build_app.py` – ghép thành `dist/nhip.html` (1 file) và `dist/nhip-pwa.zip` (bản cài đặt offline).
- `tests/` – `node --test tests/*.test.js` (unit + dữ liệu), `python3 tests/e2e_test.py` (Playwright).

Build:
    pip install cmudict pillow playwright && python3 build_data.py && python3 build_app.py

Test:
    python3 build_data.py && node --test tests/*.test.js     # 16 unit + kiểm tra dữ liệu
    python3 build_app.py && python3 tests/e2e_test.py        # 51 kiểm tra trên Chromium

Phiên bản `playwright` (pip) phải khớp với Chromium đã cài (`playwright install chromium`).

Kết quả: `dist/nhip.html` mở trực tiếp bằng trình duyệt; `dist/pwa/` là bản cài đặt offline (đưa lên GitHub Pages/Netlify).

Thêm từ mới: thêm dòng vào `data/*.txt`, chạy lại 2 lệnh build và bộ test.
