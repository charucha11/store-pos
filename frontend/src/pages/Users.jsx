import { useCallback, useEffect, useMemo, useState } from "react";
import "../styles/users.css";

const USERS_API = "/api/users.php";
const ME_API = "/api/me.php";
const MENU = [
  ["Dashboard", "/dashboard"], ["POS ขายสินค้า", "/"],
  ["สินค้า", "/product"], ["สต็อกสินค้า", "/stock"],
  ["รายงานยอดขาย", "/report"], ["จัดการผู้ใช้งาน", "/users"],
  ["หน้าโปรไฟล์ / ตั้งค่า", "/profile"],
];
const INITIAL_FORM = { username: "", phone: "", password: "", confirmPassword: "", role: "staff", full_name: "" };

async function requestJSON(url, options = {}) {
  const response = await fetch(url, { credentials: "include", ...options });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error(`เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${response.status})`); }
  if (!response.ok || !data.ok) throw new Error(data.message || `คำขอล้มเหลว (HTTP ${response.status})`);
  return data;
}
function phoneDisplay(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : (value || "-");
}
function roleName(role) { return role === "owner" ? "เจ้าของร้าน" : "พนักงานขาย"; }
function passwordScore(password) {
  return [password.length >= 6, /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
}

export default function Users() {
  const [identity, setIdentity] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ownerWarning, setOwnerWarning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [securityPassword, setSecurityPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async (signal) => {
    const data = await requestJSON(USERS_API, signal ? { signal } : {});
    setUsers(Array.isArray(data.users) ? data.users : []);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function init() {
      try {
        setLoading(true);
        const me = await requestJSON(ME_API, { signal: controller.signal });
        setIdentity(me.user || null);
        if (!me.user || !["owner", "staff"].includes(me.user.role)) return;
        await loadUsers(controller.signal);
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void init();
    return () => controller.abort();
  }, [loadUsers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("th-TH");
    return users.filter((u) =>
      [u.username, u.full_name, roleName(u.role), u.phone, phoneDisplay(u.phone)]
        .join(" ").toLocaleLowerCase("th-TH").includes(q)
    );
  }, [users, search]);
  const counts = useMemo(() => ({
    total: users.length,
    owners: users.filter((u) => u.role === "owner").length,
    staff: users.filter((u) => u.role === "staff").length,
  }), [users]);
  const setField = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  function closeAdd() { setAdding(false); setForm(INITIAL_FORM); setShowPassword(false); setShowConfirm(false); setError(""); }

  async function saveUser(event) {
    event.preventDefault();
    if (saving) return;
    if (identity?.role !== "owner") return setError("เฉพาะเจ้าของร้านเท่านั้นที่เพิ่มผู้ใช้งานได้");
    const username = form.username.trim();
    const full_name = form.full_name.trim();
    const phone = form.phone.replace(/\D/g, "");
    const password = form.password;
    if (!username || !full_name || !phone || !password || !form.confirmPassword) return setError("กรุณากรอกข้อมูลให้ครบทุกช่อง");
    if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) return setError("ชื่อผู้ใช้ต้องเป็นตัวอักษรอังกฤษ ตัวเลข _ . - ยาว 3–50 ตัว");
    if (password.length < 6) return setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
    if (password !== form.confirmPassword) return setError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
    if (!/^\d{10}$/.test(phone)) return setError("กรุณากรอกเบอร์โทรศัพท์ 10 หลัก");
    const body = new FormData();
    Object.entries({ action: "add", username, full_name, phone, password, role: form.role }).forEach(([k, v]) => body.append(k, v));
    try {
      setSaving(true); setError(""); setNotice("");
      await requestJSON(USERS_API, { method: "POST", body });
      await loadUsers();
      closeAdd();
      setNotice("เพิ่มผู้ใช้งานเรียบร้อยแล้ว");
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function chooseDelete(u) {
    if (identity?.role !== "owner") return;
    setError(""); setNotice("");
    if (u.role === "owner") { setOwnerWarning(true); return; }
    setDeleteTarget(u); setSecurityPassword("");
  }
  async function confirmDelete(event) {
    event.preventDefault();
    if (!deleteTarget || deleting) return;
    if (identity?.role !== "owner") return setError("เฉพาะเจ้าของร้านเท่านั้นที่ลบผู้ใช้งานได้");
    if (!securityPassword) return setError("กรุณากรอกรหัสผ่านของเจ้าของร้าน");
    const body = new FormData();
    body.append("action", "delete");
    body.append("id", String(deleteTarget.id));
    body.append("confirm_password", securityPassword);
    try {
      setDeleting(true); setError(""); setNotice("");
      await requestJSON(USERS_API, { method: "POST", body });
      await loadUsers();
      setDeleteTarget(null); setSecurityPassword("");
      setNotice("ลบผู้ใช้งานเรียบร้อยแล้ว");
    } catch (err) { setError(err.message); setSecurityPassword(""); }
    finally { setDeleting(false); }
  }

  return (
    <div className="users-root">
      <aside className="users-sidebar">
        <div className="users-logo">🛒</div><div className="users-shop-name">ร้านขายของชำ</div>
        <nav aria-label="เมนูหลัก">{MENU.map(([name, href]) => <a key={href} href={href} className={`users-menu${href === "/users" ? " active" : ""}`}>{name}</a>)}</nav>
      </aside>
      <main className="users-main">
        <h1>จัดการผู้ใช้งาน</h1>
        <p className="users-description">จัดการข้อมูลผู้ใช้งานและสิทธิ์การเข้าใช้งานระบบ</p>
        {loading && <p role="status">กำลังโหลดข้อมูลผู้ใช้งาน...</p>}
        {!loading && !["owner", "staff"].includes(identity?.role) && <div className="users-alert">ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้งานได้ <a href="/dashboard">กลับ Dashboard</a></div>}
        {error && <div className="users-error" role="alert">{error}</div>}
        {notice && <div className="users-notice" role="status">{notice}</div>}
        {!loading && ["owner", "staff"].includes(identity?.role) && <>
          <section className="users-summary" aria-label="สรุปผู้ใช้งาน">
            <div className="users-summary-card"><span>ผู้ใช้งานทั้งหมด</span><strong>{counts.total}</strong></div>
            <div className="users-summary-card"><span>เจ้าของร้าน</span><strong>{counts.owners}</strong></div>
            <div className="users-summary-card"><span>พนักงานขาย</span><strong>{counts.staff}</strong></div>
          </section>
          {!adding ? <>
            <div className="users-toolbar">
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อผู้ใช้ ชื่อ-นามสกุล หรือเบอร์โทร..." aria-label="ค้นหาผู้ใช้งาน" />
              {identity?.role === "owner" && <button type="button" className="users-primary" onClick={() => { setError(""); setNotice(""); setAdding(true); }}>+ เพิ่มผู้ใช้งาน</button>}
            </div>
            <section className="users-card users-table-wrap">
              <table className="users-table"><thead><tr><th>ผู้ใช้งาน</th><th>ชื่อ-นามสกุล</th><th>บทบาท</th><th>เบอร์โทรศัพท์</th><th>จัดการ</th></tr></thead>
                <tbody>{filtered.length ? filtered.map((u) => <tr key={u.id}>
                  <td><span className="users-identity"><span className="users-avatar">{String(u.full_name || u.username || "?").trim().charAt(0).toUpperCase()}</span>{u.username}</span></td>
                  <td>{u.full_name || "-"}</td>
                  <td><span className={`users-role ${u.role === "owner" ? "owner" : "staff"}`}>{roleName(u.role)}</span></td>
                  <td>{phoneDisplay(u.phone)}</td>
                  
<td>
  {identity?.role === "owner" ? <button
    type="button"
    className={`users-delete ${
      u.role === "owner" ? "users-delete-owner" : "users-delete-staff"
    }`}
    onClick={() => chooseDelete(u)}
    title={
      u.role === "owner"
        ? "ไม่สามารถลบเจ้าของร้าน"
        : "ลบผู้ใช้งาน"
    }
  >
    🗑
  </button> : <span aria-label="ไม่มีสิทธิ์ลบ">—</span>}
</td>

                </tr>) : <tr><td colSpan={5} className="users-empty">ไม่พบผู้ใช้งานที่ค้นหา</td></tr>}</tbody>
              </table>
            </section>
          </> : <form className="users-card users-form" onSubmit={saveUser}>
            <h2>เพิ่มผู้ใช้งาน</h2>
            <div className="users-form-grid">
              <label>ชื่อผู้ใช้<input autoComplete="off" value={form.username} onChange={(e) => setField("username", e.target.value)} placeholder="ภาษาอังกฤษหรือตัวเลข 3–50 ตัว" required /></label>
              <label>เบอร์โทรศัพท์<input inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setField("phone", e.target.value.replace(/\D/g, ""))} placeholder="กรอกเบอร์โทรศัพท์" required /></label>
              <label>รหัสผ่าน<div className="users-password-wrap"><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(e) => setField("password", e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร" required /><button type="button" onClick={() => setShowPassword((v) => !v)} aria-label="แสดงหรือซ่อนรหัสผ่าน">👁</button></div><span className="users-strength"><span style={{ width: `${passwordScore(form.password) * 25}%` }} /></span></label>
              <label>ตำแหน่ง/บทบาท<select value={form.role} onChange={(e) => setField("role", e.target.value)}><option value="staff">พนักงานขาย</option><option value="owner">เจ้าของร้าน</option></select></label>
              <label>ยืนยันรหัสผ่าน<div className="users-password-wrap"><input type={showConfirm ? "text" : "password"} autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setField("confirmPassword", e.target.value)} placeholder="ยืนยันรหัสผ่าน" required /><button type="button" onClick={() => setShowConfirm((v) => !v)} aria-label="แสดงหรือซ่อนรหัสผ่านยืนยัน">👁</button></div></label>
              <label>ชื่อ-นามสกุล<input value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} placeholder="กรอกชื่อ-นามสกุล" required /></label>
            </div>
            <div className="users-actions"><button type="submit" className="users-primary" disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึกผู้ใช้งาน"}</button><button type="button" className="users-secondary" disabled={saving} onClick={closeAdd}>ยกเลิก</button></div>
          </form>}
        </>}
      </main>
      {ownerWarning && <div className="users-overlay"><div className="users-modal" role="alertdialog" aria-modal="true" aria-labelledby="owner-modal-title"><div className="users-modal-icon">🔒</div><h2 id="owner-modal-title">ไม่สามารถลบเจ้าของร้านได้</h2><p>เพื่อความปลอดภัยของระบบ ไม่สามารถลบผู้ใช้งานที่เป็นเจ้าของร้านได้</p><button type="button" className="users-primary" onClick={() => setOwnerWarning(false)}>เข้าใจแล้ว</button></div></div>}
      {identity?.role === "owner" && deleteTarget && <div className="users-overlay"><form className="users-modal" onSubmit={confirmDelete} role="dialog" aria-modal="true" aria-labelledby="delete-modal-title"><h2 id="delete-modal-title">ยืนยันการลบพนักงาน</h2><p>คุณต้องการลบพนักงาน {deleteTarget.full_name || deleteTarget.username} ใช่หรือไม่? {identity?.role === "owner" ? "กรุณากรอกรหัสผ่านเจ้าของร้านเพื่อยืนยัน" : "การลบนี้ไม่สามารถย้อนกลับได้"}</p>{error && <p className="users-error" role="alert">{error}</p>}{identity?.role === "owner" && <input type="password" autoFocus autoComplete="current-password" value={securityPassword} onChange={(e) => setSecurityPassword(e.target.value)} placeholder="รหัสผ่านเจ้าของร้าน" required />}<div className="users-actions"><button className="users-primary" type="submit" disabled={deleting}>{deleting ? "กำลังลบ..." : "ยืนยัน"}</button><button className="users-secondary" type="button" disabled={deleting} onClick={() => { setDeleteTarget(null); setSecurityPassword(""); setError(""); }}>ยกเลิก</button></div></form></div>}
    </div>
  );
}
