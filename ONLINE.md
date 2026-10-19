# Bật chế độ trực tuyến (bảng xếp hạng lớp)

App vẫn chạy trên GitHub Pages như cũ. Bảng xếp hạng cần thêm một máy chủ dữ liệu nhỏ, dùng **Supabase** (gói miễn phí, dư sức cho 15 người).
Làm một lần, khoảng 10 phút.

## 1. Tạo máy chủ Supabase

1. Vào <https://supabase.com> → **Start your project** → đăng nhập bằng GitHub.
2. **New project**: đặt tên `nhip`, đặt mật khẩu database (lưu lại), Region chọn **Southeast Asia (Singapore)**, gói **Free** → **Create new project**. Đợi khoảng 2 phút.

## 2. Tạo bảng và lớp học

1. Menu trái → **SQL Editor** → **New query**.
2. Mở file [`supabase/schema.sql`](supabase/schema.sql) trong repo, copy toàn bộ, dán vào → **Run**. Thấy "Success" là xong.
3. Tạo lớp: chạy thêm câu sau (đổi `LOP7A` thành mã bạn muốn: 4–12 chữ cái không dấu hoặc số, không có dấu cách; chữ thường sẽ tự đổi thành chữ in hoa):

   ```sql
   insert into public.nhip_rooms (code, max_players) values ('LOP7A', 15);
   ```

## 3. Nối app với máy chủ

1. Supabase → **Project Settings** (bánh răng) → **API Keys**: copy khoá **Publishable** (`sb_publishable_...`).
   Nếu chỉ thấy tab **Legacy API keys** thì copy khoá **anon public** (`eyJ...`). Cả hai đều được, và được phép công khai.
2. Supabase → **Project Settings** → **Data API**: copy **Project URL** (`https://xxxx.supabase.co`).
3. Trên GitHub, mở file [`src/online.config.js`](src/online.config.js) → bấm biểu tượng ✏️ → điền 2 giá trị:

   ```js
   url: "https://xxxx.supabase.co",
   key: "sb_publishable_...",
   ```

   → **Commit changes** vào nhánh `main`. Khoảng 2 phút sau, GitHub tự cập nhật trang web.

## 4. Mời học sinh

Gửi link có sẵn mã lớp:

    https://nguyenduckhiem25122006-collab.github.io/App-Learning-English/?lop=LOP7A

Mỗi người chọn **tên hiển thị** và **mã PIN 4–6 số**. Đổi máy thì nhập lại đúng tên + PIN là vào được.

## Lớp bảo vệ đã có

| Nguy cơ | Cách chặn |
|---|---|
| Máy chủ lỗi / mất mạng | App vẫn học, chơi bình thường (dữ liệu nằm trên máy). Bảng xếp hạng hiện bản đã lưu kèm nhãn "Ngoại tuyến". |
| App gửi yêu cầu dồn dập | Mỗi máy gửi điểm tối đa 1 lần/phút, chỉ khi có thay đổi. Lỗi thì đợi 15 giây → 30 giây → … tối đa 15 phút rồi mới thử lại. |
| Người lạ vào phá | Phải có mã lớp mới vào được; mỗi lớp tối đa 15 người; chỉ thành viên mới xem được bảng của lớp. |
| Đoán PIN | PIN được mã hoá (bcrypt); sai 5 lần thì tên đó bị khoá 15 phút. |
| Sửa điểm để gian lận | Máy chủ chỉ nhận 1 lần cập nhật / 20 giây mỗi người, XP chỉ được tăng theo tốc độ học thật, mọi số liệu bị giới hạn trong khoảng hợp lý. |
| Đọc/ghi thẳng vào database | Bảng bị khoá hoàn toàn với bên ngoài; app chỉ gọi được 4 hàm đã kiểm tra dữ liệu. |
| Màn hình bị lỗi | App hiện nút "Về trang Hôm nay" thay vì trắng trang; dữ liệu có bản sao lưu mỗi ngày trên máy. |

## Việc quản lý thường dùng (chạy trong SQL Editor)

⚠️ Đây là các lệnh **riêng lẻ** — mỗi lần chỉ copy **một** lệnh cần dùng, thay `LOP7A` bằng mã lớp của bạn và `Tên học sinh` bằng tên thật. Đừng dán cả khối rồi bấm Run.

```sql
-- Xem bảng xếp hạng
select name, xp, week_xp, streak, words, farm_lv, beasts, last_sync from public.nhip_players where room = 'LOP7A' order by xp desc;
-- Xoá một người khỏi lớp
delete from public.nhip_players where room = 'LOP7A' and lower(name) = lower('Tên học sinh');
-- Đặt lại PIN cho người quên PIN (PIN mới 1234)
update public.nhip_players set pin_hash = crypt('1234', gen_salt('bf', 8)), fails = 0, locked_until = null
 where room = 'LOP7A' and lower(name) = lower('Tên học sinh');
-- Đổi số chỗ của lớp
update public.nhip_rooms set max_players = 20 where code = 'LOP7A';
```

## Lưu ý

- Gói miễn phí của Supabase **tạm dừng dự án nếu 7 ngày liền không ai dùng**. Khi đó vào supabase.com → chọn dự án → **Restore**; dữ liệu vẫn còn. Trong lúc dừng, app vẫn học bình thường, chỉ bảng xếp hạng báo "Ngoại tuyến".
- Bạn cùng lớp chỉ thấy: tên, XP, XP tuần này, chuỗi ngày, số từ đã học, cấp nông trại, số Linh Thú.
