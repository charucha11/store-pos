import { useEffect, useMemo, useState } from "react";

import "../styles/product.css";



const API = "/api/products.php";

const CATEGORIES = ["เครื่องดื่ม", "อาหารแห้ง", "อาหารสด", "เครื่องปรุง", "ขนม", "ของใช้", "ทั่วไป"];

const ICONS = { "เครื่องดื่ม": "🥤", "อาหารแห้ง": "🍜", "อาหารสด": "🥚", "เครื่องปรุง": "🧂", "ขนม": "🍪", "ของใช้": "🧴", "ทั่วไป": "🛍️" };

const blank = { code: "", barcode: "", name: "", category: "", price: "", stock: "" };



async function readResponse(response) {

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) throw new Error(data?.message || `เซิร์ฟเวอร์ตอบกลับ HTTP ${response.status}`);

  return data;

}



function ProductPicture({ product }) {
  const [broken, setBroken] = useState(false);
  const image = String(product.image || "").trim();
  let url = "";

  if (image) {
    if (/^(https?:\/\/|data:)/i.test(image)) {
      url = image;
    } else {
      const path = image.replace(/\\/g, "/").replace(/^\/+/, "");
      if (/^uploads\/products\//i.test(path)) {
        // Newly uploaded images are stored under backend/uploads/products.
        url = "http://127.0.0.1:8000/" + path.split("/").map(encodeURIComponent).join("/");
      } else {
        // Legacy images are served from frontend/public/uploads.
        const legacyPath = path.replace(/^uploads\//i, "");
        url = "/uploads/" + legacyPath.split("/").map(encodeURIComponent).join("/");
      }
    }
  }

  useEffect(() => setBroken(false), [url]);

  return (
    <div className="pm-image">
      {url && !broken ? (
        <img src={url} alt={product.name} onError={() => setBroken(true)} />
      ) : (
        <div className="pm-placeholder">
          {ICONS[product.category] || "🛍️"}
          <span>ยังไม่มีรูปสินค้า</span>
        </div>
      )}
    </div>
  );
}

export default function Product() {

  const [products, setProducts] = useState([]);

  const [search, setSearch] = useState("");

  const [category, setCategory] = useState("ทั้งหมด");

  const [isOwner, setIsOwner] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState(blank);

  const [file, setFile] = useState(null);

  const [preview, setPreview] = useState("");

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [loggingOut, setLoggingOut] = useState(false);



  async function handleLogout() {

    if (loggingOut) return;

    try {

      setLoggingOut(true);

      const response = await fetch("/api/logout.php", { method: "POST", credentials: "include", cache: "no-store" });

      if (!response.ok) throw new Error("ออกจากระบบไม่สำเร็จ");

      window.location.replace("/login");

    } catch (e) {

      setError(e.message || "ออกจากระบบไม่สำเร็จ");

      setLoggingOut(false);

    }

  }



  async function loadProducts() {

    try {

      setError("");

      const data = await readResponse(await fetch(API, { credentials: "include", cache: "no-store" }));

      setProducts(data.products || []);

    } catch (e) {

      setError(e.message);

    } finally {

      setLoading(false);

    }

  }



  useEffect(() => {
  const controller = new AbortController();

  async function checkOwner() {
    try {
      const response = await fetch("/api/me.php", {
        credentials: "include",
        signal: controller.signal,
      });

      const data = await readResponse(response);

      if (!controller.signal.aborted) {
        setIsOwner(data.user?.role === "owner");
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("ตรวจสอบสิทธิ์ผู้ใช้งานไม่สำเร็จ:", error);
        setIsOwner(false);
      }
    }
  }

  loadProducts().catch((error) => {
    console.error("โหลดข้อมูลสินค้าไม่สำเร็จ:", error);
  });

  checkOwner().catch((error) => {
    console.error("ตรวจสอบสิทธิ์ไม่สำเร็จ:", error);
  });

  return () => controller.abort();
}, []);

  useEffect(() => {

    if (!file) { setPreview(""); return; }

    const url = URL.createObjectURL(file);

    setPreview(url);

    return () => URL.revokeObjectURL(url);

  }, [file]);



  const categories = useMemo(() => ["ทั้งหมด", ...new Set(products.map(p => p.category).filter(Boolean))], [products]);

  const shown = useMemo(() => products.filter(p => {

    const word = search.trim().toLocaleLowerCase();

    const match = [p.code, p.barcode, p.name, p.category, p.id].some(v => String(v ?? "").toLocaleLowerCase().includes(word));

    return match && (category === "ทั้งหมด" || category === p.category);

  }), [products, search, category]);



  function openAddModal() {
    setEditingId(null);
    setForm({ ...blank });
    setFile(null);
    setShowModal(true);
  }

  function openEditModal(product) {
    if (!isOwner) return;
    setEditingId(Number(product.id));
    setForm({
      code: String(product.code ?? ""),
      barcode: String(product.barcode ?? ""),
      name: String(product.name ?? ""),
      category: String(product.category ?? ""),
      price: String(product.price ?? ""),
      stock: String(product.stock ?? ""),
    });
    setFile(null);
    setShowModal(true);
  }

  function closeModal() {

    if (saving) return;

    setShowModal(false);
    setEditingId(null);

    setForm(blank);

    setFile(null);

  }



  async function addProduct(event) {

    event.preventDefault();

    if (saving) return;

    if (!form.code.trim() || !form.name.trim() || !form.category || form.price === "" || form.stock === "") {

      alert("กรุณากรอกข้อมูลสินค้าให้ครบ"); return;

    }

    const price = Number(form.price), stock = Number(form.stock);

    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {

      alert("ราคาและจำนวนสต็อกไม่ถูกต้อง"); return;

    }

    if (file && (file.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type))) {

      alert("รูปต้องเป็น JPG, PNG, WEBP หรือ GIF และไม่เกิน 2 MB"); return;

    }

    const body = new FormData();

    body.append("action", editingId === null ? "add" : "update");
    if (editingId !== null) body.append("id", String(editingId));

    for (const [key, value] of Object.entries(form)) {
      if (editingId !== null && key === "stock") continue;
      body.append(key, String(value).trim());
    }

    if (file) body.append("image", file);

    setSaving(true);

    try {

      await readResponse(await fetch(API, { method: "POST", credentials: "include", body }));

      setShowModal(false); setEditingId(null); setForm(blank); setFile(null);

      await loadProducts();

      alert(editingId === null ? "เพิ่มสินค้าเรียบร้อยแล้ว" : "แก้ไขสินค้าเรียบร้อยแล้ว");

    } catch (e) {

      alert(e.message);

    } finally {

      setSaving(false);

    }

  }



  async function deleteProduct(product) {

    if (!window.confirm(`ต้องการลบสินค้า ${product.name} หรือไม่?`)) return;

    const body = new FormData();

    body.append("action", "delete");

    body.append("id", String(product.id));

    try {

      await readResponse(await fetch(API, { method: "POST", credentials: "include", body }));

      await loadProducts();

    } catch (e) {

      alert(e.message);

    }

  }



  return (

    <div className="pm-layout">

      <aside className="pm-sidebar">

        <div className="pm-logo">🛒</div><div className="pm-shop">ร้านขายของชำ</div>

        <nav className="pm-nav">

          <a href="/dashboard">Dashboard</a>

          <a href="/">POS ขายสินค้า</a>

          <a className="active" href="/product">สินค้า</a>

          <a href="/stock">สต็อกสินค้า</a>

          <a href="/report">รายงานยอดขาย</a>

          <a href="/users">จัดการผู้ใช้งาน</a>

          <a href="/profile">หน้าโปรไฟล์ / ตั้งค่า</a>

        </nav>

        <button

          type="button"

          onClick={handleLogout}

          disabled={loggingOut}

          style={{

            display: "block", width: "calc(100% - 32px)", boxSizing: "border-box",

            margin: "24px 16px 16px", padding: "13px 12px", background: "#315A7D",

            color: "#fff", border: "none", borderRadius: 8, fontSize: 15,

            fontWeight: 600, cursor: loggingOut ? "not-allowed" : "pointer",

            opacity: loggingOut ? 0.65 : 1

          }}

        >

          {loggingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}

        </button>

      </aside>

      <main className="pm-main">

        <h1>สินค้า</h1>

        <div className="pm-search"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ค้นหาสินค้า..." aria-label="ค้นหาสินค้า" /></div>

        <div className="pm-categories">

          {categories.map(c => <button key={c} type="button" className={category === c ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>)}

        </div>

        <div className="pm-tools">

          {isOwner && <button className="pm-primary" type="button" onClick={openAddModal}>+ เพิ่มสินค้า</button>}

        </div>

        {loading && <p>กำลังโหลดสินค้า...</p>}

        {error && <div className="pm-error" role="alert">{error} <button onClick={loadProducts}>ลองใหม่</button></div>}

        {!loading && !error && <div className="pm-grid">

          {shown.length === 0 && <div className="pm-empty">🔍 ไม่พบสินค้าที่ค้นหา</div>}

          {shown.map(product => <article className="pm-card" key={product.id}>

            <ProductPicture product={product} />

            <div className="pm-code">{product.code || `#${product.id}`}</div>

            <div className="pm-name">{product.name}</div>

            <span className="pm-category">{product.category}</span>

            <div className="pm-bottom"><strong>฿{Number(product.price || 0).toFixed(2)}</strong><span>เหลือ {product.stock} ชิ้น</span></div>

            {isOwner && <div className="pm-actions" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => openEditModal(product)} title="แก้ไขสินค้า" aria-label={`แก้ไข ${product.name}`} style={{ background: "#416b89", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z" /></svg></button>
              <button type="button" onClick={() => deleteProduct(product)} title="ลบสินค้า" aria-label={`ลบ ${product.name}`}>🗑</button>
            </div>}

          </article>)}

        </div>}

      </main>

      {showModal && (
  <div className="pm-overlay">
    <button
      type="button"
      className="pm-overlay-close"
      onClick={closeModal}
      aria-label="ปิดหน้าต่างเพิ่มหรือแก้ไขสินค้า"
    />

    <div
      className="pm-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={editingId === null ? "เพิ่มสินค้า" : "แก้ไขสินค้า"}
    >

        

          <h2>{editingId === null ? "เพิ่มสินค้า" : "แก้ไขสินค้า"}</h2>

          <form onSubmit={addProduct}>

            <div className="pm-form-grid">

              <label>รหัสสินค้า<input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="เช่น P013" /></label>

              <label>บาร์โค้ด<input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="กรอกบาร์โค้ด" /></label>

              <label className="full">ชื่อสินค้า<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="กรอกชื่อสินค้า" /></label>

              <label>หมวดหมู่<select required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option value="">เลือกหมวดหมู่</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>

              <label>ราคา<input required type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></label>

              {editingId === null ? <label>จำนวนคงเหลือ<input required type="number" min="0" step="1" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></label> : <label>จำนวนคงเหลือ<input type="number" value={form.stock} disabled title="แก้ไขจำนวนได้ที่หน้าสต็อกสินค้า" /></label>}

              <label className="full">รูปสินค้า<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => setFile(e.target.files?.[0] || null)} />

                <div className="pm-preview">{preview ? <img src={preview} alt="ตัวอย่างรูปสินค้า" /> : "เลือกรูปสินค้าเพื่อดูตัวอย่าง"}</div>

              </label>

            </div>

            <div className="pm-dialog-buttons"><button type="button" className="pm-cancel" onClick={closeModal} disabled={saving}>ยกเลิก</button><button className="pm-primary" disabled={saving} type="submit">{saving ? "กำลังบันทึก..." : editingId === null ? "บันทึกสินค้า" : "บันทึกการแก้ไข"}</button></div>

          </form>

        </div>

      </div>)}

    </div>

  );

}
