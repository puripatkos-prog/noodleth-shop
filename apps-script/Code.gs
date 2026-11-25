/**
 * ระบบหลังบ้านร้านบะหมี่ "เส้นเด็ด" — Google Apps Script (Web App)
 * ผูกกับ Google Sheet (Extensions > Apps Script) แล้วรัน setup() หนึ่งครั้ง
 *
 * ชีตที่ใช้: Products, Orders, OrderItems, Settings
 * ความปลอดภัย:
 *  - ราคา/ชื่อสินค้า คำนวณจากชีต Products ฝั่งเซิร์ฟเวอร์เสมอ (ไม่เชื่อค่าจากหน้าเว็บ)
 *  - การดู/แก้ไขออเดอร์ต้องส่ง ADMIN_KEY (เก็บใน Script properties ไม่อยู่ใน GitHub)
 */

var TZ = 'Asia/Bangkok';
var SHEETS = {
  Products:   ['sku','name','description','price','weight_g','stock','image','bin_location','active','unit'],
  Orders:     ['order_id','created_at','name','phone','address','subdistrict','district','province','zip','note','payment','subtotal','shipping','total','status','tracking','updated_at'],
  OrderItems: ['order_id','sku','name','qty','unit_price','bin_location'],
  Settings:   ['key','value']
};
var STATUSES = ['NEW','PACKED','SHIPPED','CANCELLED'];

/* ---------- ติดตั้งครั้งแรก ---------- */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold').setBackground('#ffe8cc');
      sh.setFrozenRows(1);
    }
  });
  // เบอร์โทร (D) และรหัสไปรษณีย์ (I) ต้องเป็นข้อความ เพื่อไม่ให้เลข 0 นำหน้าหาย
  var os = ss.getSheetByName('Orders');
  os.getRange('D:D').setNumberFormat('@'); os.getRange('I:I').setNumberFormat('@');
  var p = ss.getSheetByName('Products');
  if (p.getLastRow() < 2) {
    p.getRange(2, 1, 3, 10).setValues([
      ['NDL-TY-001','บะหมี่กึ่งสำเร็จรูป รสต้มยำกุ้ง','ซุปต้มยำเข้มข้น หอมตะไคร้ ใบมะกรูด เส้นเหนียวนุ่ม',89,360,200,'tomyum.svg','A-01',true,'แพ็ค 6 ซอง'],
      ['NDL-MS-002','บะหมี่กึ่งสำเร็จรูป รสหมูสับน้ำใส','ซุปใสหวานหอมกระดูกหมู กินง่าย ถูกปากทุกวัย',79,330,200,'moosub.svg','A-02',true,'แพ็ค 6 ซอง'],
      ['NDL-KM-003','บะหมี่กึ่งสำเร็จรูป รสผัดขี้เมา (แบบแห้ง)','เส้นผัดแห้งเผ็ดจัดจ้าน หอมใบโหระพา พริกสด',99,420,150,'keemao.svg','B-01',true,'แพ็ค 6 ซอง']
    ]);
  }
  var s = ss.getSheetByName('Settings');
  if (s.getLastRow() < 2) {
    s.getRange(2, 1, 7, 2).setValues([
      ['shipping_fee', 40], ['free_shipping_over', 399],
      ['shop_name', 'เส้นเด็ด'], ['sender_name', 'ร้านเส้นเด็ด'],
      ['sender_phone', '081-234-5678'],
      ['sender_address', '123 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพฯ 10100'],
      ['max_qty_per_item', 50]
    ]);
  }
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) {
    props.setProperty('ADMIN_KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  }
  Logger.log('ADMIN_KEY ของคุณ = ' + props.getProperty('ADMIN_KEY') + '  (เปลี่ยนได้ที่ Project Settings > Script properties)');
}

/* ---------- helpers ---------- */
function sheet_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

function rows_(name) {
  var sh = sheet_(name), v = sh.getDataRange().getValues();
  var head = v.shift();
  return v.filter(function (r) { return r[0] !== ''; }).map(function (r, i) {
    var o = {}; head.forEach(function (h, j) { o[h] = r[j]; }); o._row = i + 2; return o;
  });
}

function settings_() {
  var o = {}; rows_('Settings').forEach(function (r) { o[r.key] = r.value; });
  o.shipping_fee = Number(o.shipping_fee) || 0;
  o.free_shipping_over = Number(o.free_shipping_over) || 0;
  o.max_qty_per_item = Number(o.max_qty_per_item) || 50;
  return o;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function isActive_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

function authed_(key) {
  var k = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!k && !!key && String(key) === k;
}

function clean_(s, max) {
  s = String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  // กัน formula injection ใน Google Sheet
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

/* ---------- GET ---------- */
function doGet(e) {
  try {
    var a = (e.parameter.action || 'products');
    if (a === 'products') {
      var st = settings_();
      var prods = rows_('Products').filter(function (p) { return isActive_(p.active); }).map(function (p) {
        return { sku: p.sku, name: p.name, description: p.description, price: Number(p.price), stock: Number(p.stock),
                 image: p.image, unit: p.unit, active: true };   // ไม่ส่ง bin_location/น้ำหนักให้สาธารณะ
      });
      return json_({ ok: true, settings: { shipping_fee: st.shipping_fee, free_shipping_over: st.free_shipping_over }, products: prods });
    }
    if (a === 'orders') {
      if (!authed_(e.parameter.key)) return json_({ ok: false, error: 'unauthorized' });
      var items = rows_('OrderItems'), by = {};
      items.forEach(function (it) { (by[it.order_id] = by[it.order_id] || []).push(it); });
      var orders = rows_('Orders').map(function (o) {
        o.items = by[o.order_id] || [];
        o.created_at = o.created_at instanceof Date ? Utilities.formatDate(o.created_at, TZ, 'yyyy-MM-dd HH:mm') : o.created_at;
        o.updated_at = o.updated_at instanceof Date ? Utilities.formatDate(o.updated_at, TZ, 'yyyy-MM-dd HH:mm') : o.updated_at;
        o.phone = String(o.phone).replace(/^'/, ''); o.zip = String(o.zip).replace(/^'/, '');
        return o;
      });
      var st2 = settings_();
      return json_({ ok: true, orders: orders, settings: st2 });
    }
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/* ---------- POST ---------- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents);
    lock.waitLock(20000);
    if (body.action === 'createOrder') return json_(createOrder_(body));
    if (body.action === 'updateStatus') return json_(updateStatus_(body));
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: 'เกิดข้อผิดพลาด: ' + err });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function createOrder_(b) {
  var c = b.customer || {}, st = settings_();
  var cust = {
    name: clean_(c.name, 80), phone: String(c.phone || '').replace(/[^\d]/g, ''),
    address: clean_(c.address, 200), subdistrict: clean_(c.subdistrict, 60), district: clean_(c.district, 60),
    province: clean_(c.province, 60), zip: String(c.zip || '').replace(/[^\d]/g, ''),
    note: clean_(c.note, 200), payment: c.pay === 'COD' ? 'COD' : 'TRANSFER'
  };
  if (!cust.name || !cust.address || !cust.subdistrict || !cust.district || !cust.province) return { ok: false, error: 'ข้อมูลผู้รับไม่ครบ' };
  if (!/^0\d{8,9}$/.test(cust.phone)) return { ok: false, error: 'เบอร์โทรไม่ถูกต้อง' };
  if (!/^\d{5}$/.test(cust.zip)) return { ok: false, error: 'รหัสไปรษณีย์ไม่ถูกต้อง' };
  if (!b.items || !b.items.length || b.items.length > 20) return { ok: false, error: 'ไม่มีรายการสินค้า' };

  var psh = sheet_('Products'), prods = rows_('Products'), map = {};
  prods.forEach(function (p) { map[p.sku] = p; });
  var lines = [], subtotal = 0, seen = {};
  for (var i = 0; i < b.items.length; i++) {
    var sku = String(b.items[i].sku), qty = Math.floor(Number(b.items[i].qty));
    var p = map[sku];
    if (!p || !isActive_(p.active) || seen[sku]) return { ok: false, error: 'สินค้าไม่ถูกต้อง: ' + sku };
    seen[sku] = 1;
    if (!(qty >= 1) || qty > st.max_qty_per_item) return { ok: false, error: 'จำนวนไม่ถูกต้อง: ' + p.name };
    if (Number(p.stock) < qty) return { ok: false, error: 'สต็อกไม่พอ: ' + p.name + ' (เหลือ ' + p.stock + ')' };
    lines.push({ p: p, qty: qty });
    subtotal += Number(p.price) * qty;
  }
  var shipping = subtotal >= st.free_shipping_over ? 0 : st.shipping_fee;
  var total = subtotal + shipping;

  var osh = sheet_('Orders'), ish = sheet_('OrderItems');
  var now = new Date();
  var id = 'ORD-' + Utilities.formatDate(now, TZ, 'yyMMdd') + '-' + ('000' + (osh.getLastRow())).slice(-4);
  osh.appendRow([id, now, cust.name, cust.phone, cust.address, cust.subdistrict, cust.district, cust.province,
                 cust.zip, cust.note, cust.payment, subtotal, shipping, total, 'NEW', '', now]);
  lines.forEach(function (l) {
    ish.appendRow([id, l.p.sku, l.p.name, l.qty, Number(l.p.price), l.p.bin_location]);
    psh.getRange(l.p._row, 6).setValue(Number(l.p.stock) - l.qty);   // ตัดสต็อก
  });
  return { ok: true, order_id: id, total: total };
}

function updateStatus_(b) {
  if (!authed_(b.key)) return { ok: false, error: 'unauthorized' };
  if (STATUSES.indexOf(b.status) < 0) return { ok: false, error: 'สถานะไม่ถูกต้อง' };
  var o = rows_('Orders').filter(function (r) { return r.order_id === b.order_id; })[0];
  if (!o) return { ok: false, error: 'ไม่พบออเดอร์' };
  var sh = sheet_('Orders'), head = SHEETS.Orders;
  sh.getRange(o._row, head.indexOf('status') + 1).setValue(b.status);
  if (b.tracking !== undefined) sh.getRange(o._row, head.indexOf('tracking') + 1).setValue(clean_(b.tracking, 40));
  sh.getRange(o._row, head.indexOf('updated_at') + 1).setValue(new Date());
  // ยกเลิกออเดอร์ → คืนสต็อก
  if (b.status === 'CANCELLED' && o.status !== 'CANCELLED') {
    var psh = sheet_('Products'), prods = rows_('Products');
    rows_('OrderItems').filter(function (it) { return it.order_id === o.order_id; }).forEach(function (it) {
      var p = prods.filter(function (x) { return x.sku === it.sku; })[0];
      if (p) psh.getRange(p._row, 6).setValue(Number(p.stock) + Number(it.qty));
    });
  }
  return { ok: true };
}
