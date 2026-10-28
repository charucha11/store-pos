import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/pos.css";
const SALES_KEY = "posSalesCount";
const QUICK_LIMIT = 6;
const money = (value) => Number(value || 0).toFixed(2);
function readSales() {
  try { return JSON.parse(localStorage.getItem(SALES_KEY)) || {}; }
  catch { return {}; }
}
export default function Pos() {
  const [page, setPage] = useState("pos");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const barcodeRef = useRef(null);
  const [productSearch, setProductSearch] = useState("");
  const [sales, setSales] = useState(readSales);
  const [cashInput, setCashInput] = useState("");
  const [slipFile, setSlipFile] = useState(null);
  const [verifyStatus, setVerifyStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cashRef = useRef(null);
  useEffect(() => {
    let active = true;
    fetch("/api/products.php", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!data.ok) throw new Error(data.message || "โหลดสินค้าไม่สำเร็จ");
        if (active) setProducts((data.products || []).map((p) => ({
          id: Number(p.id),
  code: p.code,
  barcode: String(p.barcode ?? "").trim(),
  name: p.name,
  price: Number(p.price),
  stock: Number(p.stock),
  image: p.image
  
})));
      })
      .catch((error) => { if (active) console.error("โหลดสินค้า:", error); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (page === "cash") cashRef.current?.focus(); }, [page]);
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const cash = Number(cashInput) || 0;
  const change = Math.max(0, cash - total);
  const hasSales = Object.keys(sales).length > 0;
  const quickProducts = useMemo(() => products.map((product, index) => ({ product, sold: sales[product.id] || 0, index }))
    .sort((a, b) => b.sold - a.sold || a.index - b.index).slice(0, QUICK_LIMIT), [products, sales]);
  const filtered = useMemo(() => products.filter(p => p.name.toLowerCase().includes(productSearch.trim().toLowerCase())), [products, productSearch]);
  // USB HID scanners behave like a keyboard and usually send Enter.
  function scanBarcode(event) {
    event.preventDefault();
    const value = barcodeInput.trim();
    if (!value) return;
  
    const product = products.find((p) => p.barcode === value);
    if (!product) {
      alert(`ไม่พบสินค้าที่มีบาร์โค้ด ${value} กรุณาตรวจสอบเลขในหน้าสินค้า`);
    } else {
      addProduct(product.id, true);
    }
    setBarcodeInput("");
    barcodeRef.current?.focus();
  }

function addProduct(id, silent = false) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  const inCart = cart.find(p => p.id === id)?.quantity || 0;
  if (product.stock <= 0) {
    alert(`สินค้า "${product.name}" หมดสต็อก`);
    return;
  }
  if (inCart >= product.stock) {
    alert(`สินค้า "${product.name}" เหลือเพียง ${product.stock} ชิ้น`);
    return;
  }
  setCart(previous => {
    const existing = previous.find(p => p.id === id);
    return existing
      ? previous.map(item =>
          item.id === id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      : [...previous, {
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1
        }];
  });
  if (!silent) {
    alert(`เพิ่ม ${product.name} ลงในรายการแล้ว`);
  }
}
  function updateQuantity(id, quantity) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const qty = Number.parseInt(quantity, 10);
    if (product.stock <= 0) {
      alert(`สินค้า "${product.name}" หมดสต็อก`);
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) return;
    if (qty > product.stock) {
      alert(`สินค้า "${product.name}" เหลือเพียง ${product.stock} ชิ้น`);
      return;
    }
    setCart(items => items.map(item => item.id === id ? { ...item, quantity: qty } : item));
  }  function removeProduct(id) {
    const item = cart.find(p => p.id === id);
    if (item && window.confirm(`ต้องการลบ ${item.name} ออกจากรายการหรือไม่?`)) setCart(previous => previous.filter(p => p.id !== id));
  }
  function openSearch() {
  setProductSearch(search.trim());
  setPage("search");
}
  function openMethods() {
    if (cart.length === 0) return alert("กรุณาเพิ่มสินค้าก่อนชำระเงิน");
    setPage("methods");
  }
  async function submitOrder(method, ref = "", amountCash = null) {
    const response = await fetch("/api/save-order.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, ref, cash: amountCash, items: cart.map(({ id, quantity }) => ({ id, qty: quantity })) })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || "บันทึกการขายไม่สำเร็จ");
    return data;
  }
  function finishPayment(label, verified, ref, amountCash, saved) {
    const receipt = {
      orderId: "B" + String(saved.order_id).padStart(6, "0"),
      time: new Date().toISOString(),
      items: cart.map(({ name, quantity, price }) => ({ name, qty: quantity, price })),
      total: saved.total ?? total, method: label, verified, ref: ref || ""
    };
    if (amountCash !== undefined) {
      receipt.cash = amountCash;
      receipt.change = saved.change ?? amountCash - total;
    }
    sessionStorage.setItem("lastOrder", JSON.stringify(receipt));
    const next = readSales();
    cart.forEach(item => { next[item.id] = (next[item.id] || 0) + item.quantity; });
    localStorage.setItem(SALES_KEY, JSON.stringify(next));
    setSales(next);
    setCart([]);
    setPage("pos");
    // ใช้ receipt.html เดิมจนกว่าจะย้ายเป็น React
    window.location.href = "/receipt";
  }
  async function confirmCashPayment() {
    if (submitting) return;
    if (cash <= 0) return alert("กรุณากรอกจำนวนเงินที่รับมา");
    if (cash < total) return alert(`จำนวนเงินไม่เพียงพอ\nยอดที่ต้องชำระ ฿${money(total)}`);
    setSubmitting(true);
    try {
      const saved = await submitOrder("cash", "", cash);
      finishPayment("เงินสด", false, "", cash, saved);
    } catch (error) { alert(error.message); }
    finally { setSubmitting(false); }
  }
  async function confirmQRPayment() {
    if (submitting) return;
    if (total <= 0) return alert("ไม่มีรายการสินค้า");
    if (!slipFile) return alert("กรุณาเลือกไฟล์สลิปก่อนตรวจสอบ");
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jfif"];
    if (slipFile.type && !allowed.includes(slipFile.type)) return alert("รองรับเฉพาะ JPG, JPEG, PNG, JFIF และ WEBP");
    const formData = new FormData();
    formData.append("files", slipFile);
    formData.append("amount", money(total));
    formData.append(
  "items",
  JSON.stringify(
    cart.map(({ id, quantity }) => ({
      id,
      qty: quantity
    }))
  )
);
    formData.append("log", "true");
    setSubmitting(true);
    setVerifyStatus("กำลังส่งสลิปไปตรวจสอบ...");
    try {
      const res = await fetch("/api/check-slip.php", { method: "POST", credentials: "include", body: formData });
      const result = await res.json();
      if (!res.ok || result.success !== true) throw new Error(result.message || "ตรวจสอบสลิปไม่สำเร็จ");
      const ref = result.data?.transRef || result.transRef || "";
      setVerifyStatus("ตรวจสอบสลิปสำเร็จ กำลังบันทึกการขาย...");
      let saved;
      try { saved = await submitOrder("qr", ref); }
      catch (error) { throw new Error("สลิปผ่านแล้ว แต่บันทึกการขายไม่สำเร็จ: " + error.message + " — ห้ามชำระซ้ำจนกว่าจะตรวจสอบรายการขาย"); }
      finishPayment("โอนเงิน (PromptPay)", true, ref, undefined, saved);
    } catch (error) { setVerifyStatus(error.message); alert(error.message); }
    finally { setSubmitting(false); }
  }
  return <div className="container">
      <aside className="sidebar">

        <div className="logo">🛒</div>

        <div className="shop-name">ร้านขายของชำ</div>

        {[

          ["Dashboard", "/dashboard"],

          ["POS ขายสินค้า", "/"],

          ["สินค้า", "/product"],

          ["สต็อกสินค้า", "/stock"],

          ["รายงานยอดขาย", "/report"],

          ["จัดการผู้ใช้งาน", "/users"],

          ["หน้าโปรไฟล์ / ตั้งค่า", "/profile"],

        ].map(([name, href]) => (

          <a key={href} className={href === "/" ? "menu active" : "menu"} href={href}>

            {name}

          </a>

        ))}

        <button

          type="button"

          onClick={async () => {

            try {

              const response = await fetch("/api/logout.php", {

  method: "POST",

  credentials: "include",

  cache: "no-store",

});

              if (!response.ok) throw new Error("ออกจากระบบไม่สำเร็จ");

              window.location.replace("/login");

            } catch (error) {

              alert(error.message || "ออกจากระบบไม่สำเร็จ");

            }

          }}

          style={{

            display: "block", width: "calc(100% - 32px)", boxSizing: "border-box",

            margin: "24px 16px 16px", padding: "13px 12px",

            background: "#315A7D", color: "#fff", border: "none",

            borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer"

          }}

        >

          ออกจากระบบ

        </button>

      </aside>
    <main className="main">
      {page === "pos" && <div id="posPage">
        <h1>POS ขายสินค้า</h1>
                <form className="search-area" onSubmit={scanBarcode}>
          <input
            ref={barcodeRef}
            className="search-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="สแกนบาร์โค้ดสินค้า"
            placeholder="ยิงบาร์โค้ด USB หรือพิมพ์เลขแล้วกด Enter"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
          />
        </form>
<div className="search-area">
          <input id="searchInput" className="search-input" placeholder="ค้นหาสินค้า" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") openSearch(); }} />
          <button className="btn btn-search" type="button" onClick={openSearch}>🔍 ค้นหา</button>
        </div>
        <div className="card">
          <h2>สินค้าขายดี</h2>
          <div className="quick-hint" id="quickHint">{hasSales ? "เรียงจากสินค้าที่ขายบ่อยที่สุด กดเพื่อเพิ่มลงรายการ" : "ยังไม่มีข้อมูลการขาย แสดงสินค้าเริ่มต้น กดเพื่อเพิ่มลงรายการ"}</div>
          <div id="quickProducts" className="quick-grid">{quickProducts.map(({ product, sold }) =>
            <button type="button" className="quick-item" key={product.id} disabled={Number(product.stock) <= 0} onClick={() => addProduct(product.id, true)}>
              <span className="quick-name">{product.name}</span>
              <span className="quick-price">฿{money(product.price)}</span>
              {sold > 0 && <span className="quick-sold">ขายแล้ว {sold} ชิ้น</span>}
            </button>
          )}</div>
        </div>
        <div className="card">
          <h2>รายการสินค้า</h2>
          <div className="item-count">รวมรายการ <span id="itemCount">{itemCount}</span> รายการ</div>
          <div className="table-wrapper"><table><thead><tr><th>รายการ</th><th>ราคา</th><th>จำนวน</th><th>รวม</th><th>ลบ</th></tr></thead>
            <tbody id="cartTable">{cart.length === 0
              ? <tr><td colSpan={5} className="empty-cart">ยังไม่มีสินค้าในรายการ</td></tr>
              : cart.map(item => <tr key={item.id}>
                <td>{item.name}</td><td>฿{money(item.price)}</td>
                <td><div className="qty-control">
                  <button type="button" className="qty-btn" disabled={item.quantity <= 1} aria-label="ลดจำนวน" onClick={() => updateQuantity(item.id, item.quantity - 1)}>−</button>
                  <input type="number" min="1" className="quantity-input" value={item.quantity} onChange={e => updateQuantity(item.id, e.target.value)} />
                  <button type="button" className="qty-btn" aria-label="เพิ่มจำนวน" onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                </div></td>
                <td>฿{money(item.price * item.quantity)}</td>
                <td><button type="button" className="delete-btn" onClick={() => removeProduct(item.id)}>🗑</button></td>
              </tr>)}</tbody></table></div>
        </div>
        <div className="payment"><div className="total-title">ยอดรวมสุทธิ ฿<span id="total">{money(total)}</span></div>
          <button type="button" className="btn pay-btn" onClick={openMethods}>ชำระเงิน</button></div>
      </div>}
      {page === "search" && <div id="searchPage" className="search-page">
        <h1>ค้นหาสินค้า</h1>
        <button className="btn back-btn" type="button" onClick={() => setPage("pos")}>← กลับหน้าขายสินค้า</button>
        <div className="search-area">
          <input id="productSearch" className="search-input" placeholder="ค้นหาชื่อสินค้า..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
          <button type="button" className="btn btn-search" onClick={() => setProductSearch(v => v.trim())}>🔍 ค้นหา</button>
        </div>
        <div id="productList" className="product-grid">{filtered.length ? filtered.map(product => <div className="product" key={product.id}>
          {product.image && (
  <img
    src={
      "/api/" +
      product.image.replace(/^\/+/, "")
    }
    alt={product.name}
    className="pos-product-image"
    onError={(e) => {
      e.currentTarget.style.display = "none";
    }}
  />
)}
          <h3>{product.name}</h3><div className="product-price">฿{money(product.price)}</div>
          <button
            className="btn add-btn"
            type="button"
            disabled={Number(product.stock) <= 0}
            onClick={() => addProduct(product.id)}
          >
            {Number(product.stock) <= 0 ? "สินค้าหมด" : "+ เพิ่มสินค้า"}
          </button>
        </div>) : <div className="empty-cart">ไม่พบสินค้าที่ค้นหา</div>}</div>
      </div>}
      {page === "methods" && <div id="paymentMethodPage" className="payment-page" style={{ display: "block" }}><div className="payment-box">
        <h2>วิธีชำระเงิน</h2><div className="payment-total-row"><span>ยอดรวมทั้งหมด</span><strong>฿<span id="methodTotal">{money(total)}</span></strong></div>
        <div className="payment-methods">
          <button type="button" className="payment-method cash-method" onClick={() => { setCashInput(""); setPage("cash"); }}><div className="method-icon">💵</div><div><strong>เงินสด</strong><span>ชำระด้วยเงินสด</span></div></button>
          <button type="button" className="payment-method qr-method" onClick={() => { setSlipFile(null); setVerifyStatus(""); setPage("qr"); }}><div className="method-icon">▦</div><div><strong>สแกน QR Code</strong><span>ชำระด้วย QR Code</span></div></button>
        </div><button type="button" className="cancel-payment" onClick={() => setPage("pos")}>ยกเลิกการชำระเงิน</button>
      </div></div>}
      {page === "cash" && <div id="cashPaymentPage" className="payment-page" style={{ display: "block" }}><div className="payment-box">
        <h2>ชำระเงินด้วยเงินสด</h2><div className="payment-total-row"><span>ยอดรวมทั้งหมด</span><strong>฿<span id="cashTotal">{money(total)}</span></strong></div>
        <div className="cash-form"><label htmlFor="cashAmount">รับเงิน</label><div className="cash-input-row">
          <input ref={cashRef} type="number" id="cashAmount" className="cash-input" placeholder="กรอกจำนวนเงิน" min="0" value={cashInput} onChange={e => setCashInput(e.target.value)} /><span>บาท</span>
        </div><div className="cash-change"><span>เงินทอน</span><strong>฿<span id="paymentChange">{money(change)}</span></strong></div></div>
        <div className="payment-buttons"><button type="button" className="confirm-payment-btn" disabled={submitting} onClick={confirmCashPayment}>✓ {submitting ? "กำลังบันทึก..." : "ยืนยันการชำระเงิน"}</button>
          <button type="button" className="cancel-small-btn" disabled={submitting} onClick={() => setPage("methods")}>ยกเลิก</button></div>
      </div></div>}
      {page === "qr" && <div id="qrPaymentPage" className="payment-page" style={{ display: "block" }}><div className="payment-box">
        <h2>ชำระเงินด้วยสแกน QR Code</h2><div className="payment-total-row"><span>ยอดรวมทั้งหมด</span><strong>฿<span id="qrTotal">{money(total)}</span></strong></div>
        <div className="qr-content"><div className="qr-text">สแกน QR Code เพื่อชำระเงิน</div><div className="qr-code"><img src="/qr-code.jpeg" alt="QR Code สำหรับรับชำระเงิน" /></div>
          <div className="slip-area"><label htmlFor="slipFile">หลังจากโอนเงินแล้ว กรุณาแนบสลิป</label>
            <input type="file" key={page} id="slipFile" className="slip-input" accept=".jpg,.jpeg,.png,.jfif,.webp,image/jpeg,image/png,image/webp" onChange={e => setSlipFile(e.target.files?.[0] || null)} />
            <p className="slip-note">แนบสลิปแล้วกด “ตรวจสอบการชำระเงิน” ระบบจะส่งสลิปไปตรวจสอบกับ SlipOK</p></div>
          <div id="verifyStatus" className="verify-status" role="status">{verifyStatus}</div>
        </div><div className="payment-buttons">
          <button type="button" id="verifyBtn" className="confirm-payment-btn" disabled={submitting} onClick={confirmQRPayment}>{submitting ? "กำลังตรวจสอบ..." : "↻ ตรวจสอบการชำระเงิน"}</button>
          <button type="button" className="cancel-small-btn" disabled={submitting} onClick={() => setPage("methods")}>ยกเลิก</button>
        </div>
      </div></div>}
    </main>
  </div>;
}
