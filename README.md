# เส้นเด็ด — แลนดิ้งเพจขายบะหมี่กึ่งสำเร็จรูป + ระบบหยิบ/แพ็ค/จ่าหน้าพัสดุ

โครงสร้างโปรเจกต์

```
noodle-shop/
├─ index.html            หน้าแลนดิ้งเพจ (ลูกค้าสั่งซื้อ)
├─ config.js             ตั้งค่า API_URL, ชื่อร้าน, LINE, เบอร์โทร
├─ products.json         ข้อมูลสินค้าสำรอง (ใช้เมื่อยังไม่ต่อ Google Sheet)
├─ vercel.json           ตั้งค่า Vercel
├─ images/products/      โฟลเดอร์รูปสินค้า (แยกต่างหาก) — ชื่อไฟล์ตรงกับคอลัมน์ image ในชีต
├─ admin/index.html      หลังบ้าน: รายการหยิบ → ตรวจ-แพ็ค → พิมพ์ใบจ่าหน้า
└─ apps-script/Code.gs   โค้ด Google Apps Script (วางใน Google Sheet)
```

## ขั้นที่ 1: ตั้งค่า Google Sheet

1. สร้าง Google Sheet ใหม่ (ชื่ออะไรก็ได้ เช่น "เส้นเด็ด Orders")
2. เมนู **Extensions → Apps Script** แล้ววางโค้ดจาก `apps-script/Code.gs` ทับของเดิม → Save
3. เลือกฟังก์ชัน **`setup`** แล้วกด **Run** (อนุญาตสิทธิ์ครั้งแรก) — จะสร้างชีต `Products`, `Orders`, `OrderItems`, `Settings` พร้อมสินค้าตัวอย่าง 3 SKUs
4. เปิด **View → Logs / Execution log** จะเห็น `ADMIN_KEY` ของคุณ (รหัสเข้าหลังบ้าน) — เปลี่ยนเองได้ที่ **Project Settings → Script properties → ADMIN_KEY**
5. แก้ที่อยู่/ชื่อ/เบอร์ผู้ส่งในชีต `Settings` (ใช้พิมพ์ในใบจ่าหน้า) และค่าส่งในแถว `shipping_fee`, `free_shipping_over`
6. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - กด Deploy แล้วคัดลอก URL ที่ลงท้ายด้วย `/exec`

> ทุกครั้งที่แก้โค้ด Code.gs ต้อง **Deploy → Manage deployments → Edit → New version** ถึงจะมีผล

## ขั้นที่ 2: ใส่ API_URL

แก้ `config.js`

```js
window.CONFIG = {
  API_URL: "https://script.google.com/macros/s/xxxxxxxx/exec",
  SHOP_NAME: "เส้นเด็ด",
  LINE_ID: "@sendet",
  CONTACT_PHONE: "081-234-5678"
};
```

## ขั้นที่ 3: ขึ้น GitHub

```bash
cd noodle-shop
git init
git add .
git commit -m "init noodle shop"
git branch -M main
git remote add origin https://github.com/<username>/noodle-shop.git
git push -u origin main
```

(หรือสร้าง repo บน github.com แล้วลากไฟล์ทั้งโฟลเดอร์ขึ้นไป)

รูปสินค้าอยู่ที่ `images/products/` — เพิ่มสินค้าใหม่ให้อัปโหลดรูป (.svg/.png/.jpg/.webp) ไว้ที่นี่ แล้วใส่ชื่อไฟล์ในคอลัมน์ `image` ของชีต `Products`

## ขั้นที่ 4: Deploy บน Vercel

1. เข้า vercel.com → **Add New → Project** → Import repo `noodle-shop`
2. Framework Preset: **Other** (ไม่ต้องมี build command / output directory — เป็นเว็บ static)
3. กด **Deploy** จะได้โดเมน `https://<ชื่อโปรเจกต์>.vercel.app`
4. (ถ้ามีโดเมนของตัวเอง) Project → **Settings → Domains → Add**

หลังจากนี้ทุกครั้งที่ `git push` Vercel จะ deploy ให้อัตโนมัติ

## การใช้งานประจำวัน

หน้าหลังบ้าน: `https://<โดเมน>/admin/` → ใส่ `ADMIN_KEY`

| แท็บ | ทำอะไร |
|---|---|
| 1) รายการหยิบสินค้า | รวมจำนวนทุกออเดอร์ใหม่ตาม SKU เรียงตามชั้นวาง (`bin_location`) เดินหยิบรอบเดียว |
| 2) ตรวจ-แพ็ค | ทีละออเดอร์ ติ๊กทุกรายการให้ครบก่อน ปุ่ม "แพ็คเสร็จแล้ว" จึงกดได้ → สถานะ `PACKED` |
| 3) พิมพ์ใบจ่าหน้า | เลือกออเดอร์ → พิมพ์ใบจ่าหน้า 100×150 มม. (มียอด COD ถ้าเก็บเงินปลายทาง) → ใส่เลขพัสดุ กด "ส่งแล้ว" → `SHIPPED` |
| ออเดอร์ทั้งหมด | ดูประวัติ |

การยกเลิกออเดอร์ (สถานะ `NEW`) จะคืนสต็อกให้อัตโนมัติ

## ความปลอดภัยที่ทำไว้

- ราคา ชื่อสินค้า และสต็อก ตรวจ/คำนวณใหม่ฝั่ง Apps Script ทุกครั้ง ไม่เชื่อค่าจากหน้าเว็บ
- ข้อมูลออเดอร์ (ชื่อ ที่อยู่ เบอร์โทร) ดูได้เฉพาะผู้ที่มี `ADMIN_KEY` — ซึ่งเก็บใน Script properties ไม่อยู่ใน GitHub
- ป้องกัน formula injection ในชีต และ escape HTML ในหน้าหลังบ้าน
- มี honeypot กันบอทสแปมแบบง่าย
- หน้า `/admin/` ตั้ง `noindex` ไม่ให้ Google เก็บ

## ข้อจำกัดที่ควรรู้

- ระบบชำระเงินจริง (บัตร/QR อัตโนมัติ) ยังไม่ได้เชื่อม — ลูกค้าเลือก "โอน/พร้อมเพย์" หรือ "COD" แล้วทางร้านติดต่อกลับ
- รูปสินค้าตัวอย่างเป็นภาพวาด SVG ชั่วคราว ให้แทนด้วยรูปถ่ายจริงชื่อไฟล์เดิม หรือเปลี่ยนชื่อในชีต
- ชื่อแบรนด์ "เส้นเด็ด", LINE, เบอร์โทร และที่อยู่ผู้ส่ง เป็นข้อมูลตัวอย่าง ต้องแก้เป็นของจริง
