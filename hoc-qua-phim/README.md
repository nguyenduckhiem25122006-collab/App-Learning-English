# 🎬 Học Tiếng Anh Qua Phim

Web app học tiếng Anh từ chính đoạn phim bạn thích. Bạn tải đoạn phim tiếng Anh lên (kèm phụ đề), app **tự đọc phụ đề, chia phim thành từng cảnh và tạo bài tập**: nghe có sub, nghe tắt sub, điền từ, chép chính tả, shadowing, lồng tiếng, sổ từ vựng…

- Chạy hoàn toàn trên trình duyệt (máy tính và điện thoại), **video không tải lên máy chủ nào**.
- Không cần cài đặt, không cần tài khoản. Có thể "Cài đặt app" (PWA) để mở như ứng dụng.
- Tiến độ, sổ từ và (tuỳ chọn) video được lưu trong trình duyệt (IndexedDB). Có nút sao lưu/khôi phục.

## Cách dùng

1. Mở app → **＋ Chọn đoạn phim** (hoặc kéo thả). Chọn cùng lúc:
   - file video: MP4, MKV, WebM, MOV…
   - phụ đề tiếng Anh `.srt` / `.vtt` / `.ass` (không bắt buộc nếu phụ đề đã có sẵn trong file MKV/MP4/WebM),
   - phụ đề tiếng Việt (tuỳ chọn) — hoặc 1 file phụ đề song ngữ Anh–Việt.
2. App tự tìm phụ đề theo thứ tự:
   1. file phụ đề bạn chọn kèm;
   2. phụ đề chữ **nhúng sẵn trong video** (MKV: SRT/ASS/WebVTT, MP4: mov_text, WebM: WebVTT) — đọc trực tiếp, không cần mạng;
   3. nếu không có: hỏi bạn chọn file `.srt`, hoặc **tạo phụ đề bằng AI** (Whisper chạy ngay trong trình duyệt, cần mạng để tải mô hình lần đầu).
3. Học theo **Lộ trình**: mỗi cảnh ~8 câu thoại, 10 bước.

> Phim có phụ đề **in cứng trên hình** (hardsub): app không đọc được chữ trên hình, hãy kèm file `.srt` (hoặc dùng AI). Bật nút **▬ Che sub cứng** để che dải chữ trên hình khi luyện nghe tắt sub.

## Lộ trình 10 bước cho mỗi cảnh

| # | Bước | Nội dung |
|---|------|----------|
| 1 | 👀 Xem không sub | Xem cả cảnh không phụ đề, đoán ý chính, tự đánh giá mức hiểu |
| 2 | 📖 Xem có sub & tra từ | Phụ đề Anh (+ Việt), bấm vào từ bất kỳ để tra nghĩa, lưu sổ từ |
| 3 | 🎧 Nghe chọn câu đúng | 4 câu chỉ khác nhau 1 từ dễ nghe nhầm (can/can't, thirteen/thirty, live/leave…) |
| 4 | ✍️ Nghe điền từ | Tắt sub, điền từ còn thiếu; 3 mức khó; ưu tiên đục lỗ từ mới và từ đã lưu; chấp nhận lỗi gõ nhẹ |
| 5 | 🧩 Sắp xếp từ | Nghe rồi bấm các mảnh câu theo đúng thứ tự |
| 6 | 🔎 Tìm từ sai | Phụ đề bị cài 1 từ sai, nghe kỹ để tìm |
| 7 | 📝 Chép chính tả | Gõ lại cả câu, app so từng từ: đúng / thiếu / thừa |
| 8 | 🗣️ Shadowing | Nghe – nói đuổi – ghi âm – so với giọng gốc; Chrome/Edge chấm điểm bằng nhận dạng giọng nói |
| 9 | 🎭 Lồng tiếng | Video tự tắt tiếng đúng câu thoại, bạn nói thay nhân vật, xem lại bản lồng tiếng của mình |
| 10 | 🔁 Xem lại không sub | So mức hiểu với bước 1 |

## Tính năng khác

- **Trình phát học tập**: câu trước/sau, nghe lại câu, lặp 1 câu, tự dừng sau mỗi câu, tốc độ 0.5×–1.25×, phụ đề Anh / Anh+Việt / Việt / **ẩn từ mới** / tắt, chỉnh lệch phụ đề ±0,1s, toàn màn hình.
- **Lời thoại**: toàn bộ kịch bản, tìm kiếm, bấm để nhảy tới câu, tự cuộn theo video.
- **Luyện tập tự do**: chọn dạng bài bất kỳ cho 10 câu ngẫu nhiên, một cảnh, hoặc **các câu đã làm sai**; **thử thách nghe nhanh** 20 câu.
- **Từ vựng của phim**: danh sách từ đáng học (bỏ từ thông dụng) theo tần suất, **tốc độ nói (từ/phút)** để biết phim khó hay dễ.
- **Từ điển nổi**: bấm vào từ trên phụ đề → phiên âm, nghĩa tiếng Việt, định nghĩa Anh–Anh, phát âm (cần mạng; offline vẫn lưu từ được).
- **Sổ từ ôn ngắt quãng (Leitner)**: mỗi thẻ là câu thoại gốc bị che từ, nghe lại đúng đoạn phim; ôn theo lịch 1–2–4–8–16… ngày; xuất CSV sang Anki/Quizlet.
- Xuất phụ đề `.srt` (sau khi chỉnh lệch hoặc tạo bằng AI). Phím tắt: Space, ←/→, R, S, 1–4, Enter.

## Chạy thử trên máy

Không cần build. Chỉ cần một máy chủ tĩnh (module JS không chạy được khi mở file trực tiếp):

```bash
npx http-server -c-1 -p 8080 .     # hoặc: python3 -m http.server 8080
# mở http://localhost:8080
```

## Đưa lên web (GitHub Pages)

Workflow `.github/workflows/pages.yml` chạy kiểm thử và tự đăng app mỗi khi push lên `main`.
Lần đầu: vào **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Kiểm thử

```bash
npm test            # unit: đọc SRT/VTT/ASS, trích phụ đề nhúng MKV/MP4/WebM, tạo & chấm bài tập, lịch ôn tập
npm run test:e2e    # Playwright + Chromium: đi qua toàn bộ luồng (cần ffmpeg và `npm i playwright`)
```

## Cấu trúc

| File | Vai trò |
|------|---------|
| `index.html`, `css/style.css` | Giao diện (sáng/tối, điện thoại/máy tính) |
| `js/app.js` | Trình phát, lộ trình, các dạng bài, sổ từ |
| `js/subtitles.js` | Đọc SRT/VTT/ASS, tách dòng Anh/Việt, làm sạch chú thích âm thanh, ghép bản dịch theo thời gian |
| `js/embedded.js` | Trích phụ đề nhúng trong MKV/WebM (EBML) và MP4 (tx3g/wvtt), đọc file theo khúc |
| `js/exercises.js` | Tạo bài tập tự động (điền từ, sắp xếp, câu nhiễu, từ sai), so khớp từng từ, chia cảnh, Leitner |
| `js/services.js` | Từ điển, dịch, giọng đọc, nhận dạng giọng nói, ghi âm, Whisper AI |
| `js/store.js` | Lưu dữ liệu bằng IndexedDB |
| `sw.js`, `manifest.webmanifest` | Chạy offline / cài như app |

Dịch vụ ngoài (đều miễn phí, không cần khoá, chỉ dùng khi có mạng): [Free Dictionary API](https://dictionaryapi.dev), [MyMemory](https://mymemory.translated.net), [Transformers.js](https://huggingface.co/docs/transformers.js) + Whisper.
