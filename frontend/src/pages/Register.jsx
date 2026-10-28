
import { useState } from "react";
import "../styles/register.css";

const API = "/api/register.php";

function EyeIcon({ visible }) {
  return visible ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a17.6 17.6 0 0 1 4.06-5.06" />
      <path d="M9.9 4.24A9.7 9.7 0 0 1 12 4c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export default function Register() {
  const [form, setForm] = useState({
    full_name: "",
    username: "",
    phone: "",
    password: "",
    role: "",
    owner_password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const strength =
    form.password.length === 0 ? 0 :
    form.password.length < 6 ? 30 :
    form.password.length < 10 ? 65 : 100;

  const strengthText =
    strength === 0 ? "ความปลอดภัยของรหัสผ่าน" :
    strength === 30 ? "รหัสผ่านอ่อน" :
    strength === 65 ? "รหัสผ่านปานกลาง" :
    "รหัสผ่านแข็งแรง";

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;

    setError("");

    if (!form.full_name.trim() || !form.username.trim()) {
      setError("กรุณากรอกชื่อ-นามสกุลและชื่อผู้ใช้");
      return;
    }

    if (!/^[0-9]{10}$/.test(form.phone)) {
      setError("กรุณากรอกเบอร์โทรศัพท์ 10 หลัก");
      return;
    }

    if (form.password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    if (!form.role) {
      setError("กรุณาเลือกประเภทผู้ใช้");
      return;
    }

    if (form.role === "owner" && !form.owner_password) {
      setError("กรุณากรอกรหัสยืนยันเจ้าของร้าน");
      return;
    }

    try {
      setLoading(true);

      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        body.append(key, value);
      });

      const response = await fetch(API, {
        method: "POST",
        credentials: "include",
        body,
      });

      const raw = await response.text();
      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON กรุณาตรวจสอบ register.php");
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "สมัครสมาชิกไม่สำเร็จ");
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message || "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="register-page">
      <div className="register-decoration register-decoration-top" />
      <div className="register-decoration register-decoration-bottom" />

      <div className="register-box">
        <div className="register-brand">
          <div className="register-logo-circle">🛒</div>
          <h2>ระบบจัดการร้านขายของชำ</h2>
          <p>สมัครสมาชิกเพื่อเข้าสู่ระบบ</p>
        </div>

        <form className="register-form" onSubmit={handleSubmit}>
          <h1>สมัครสมาชิก</h1>

          <label htmlFor="reg-fullname">ชื่อ-นามสกุล</label>
          <input
            id="reg-fullname"
            placeholder="กรอกชื่อ-นามสกุล"
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            required
          />

          <label htmlFor="reg-username">ชื่อผู้ใช้</label>
          <input
            id="reg-username"
            placeholder="กรอกชื่อผู้ใช้"
            autoComplete="username"
            value={form.username}
            onChange={(e) => update("username", e.target.value)}
            required
          />

          <div className="register-two-columns">
            <div className="register-field">
              <label htmlFor="reg-phone">เบอร์โทรศัพท์</label>
              <input
                id="reg-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="กรอกเบอร์โทรศัพท์"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                required
              />
            </div>

            <div className="register-field">
              <label htmlFor="reg-password">รหัสผ่าน</label>
              <div className="register-password-wrap">
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="กรอกรหัสผ่าน"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  required
                />
                <button type="button" className="register-eye"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>
                  <EyeIcon visible={showPassword} />
                </button>
              </div>
              <div className="register-strength-track">
                <div
                  className={`register-strength-fill strength-${strength}`}
                  style={{ width: `${strength}%` }}
                />
              </div>
              <small>{strengthText}</small>
            </div>
          </div>

          <div className="register-role-section">
            <p>ผู้ใช้บัญชีคือ?</p>
            <div className="register-role-options">
              <label>
                <input
                  type="radio"
                  name="role"
                  value="owner"
                  checked={form.role === "owner"}
                  onChange={() => update("role", "owner")}
                />
                เจ้าของร้าน
              </label>
              <label>
                <input
                  type="radio"
                  name="role"
                  value="staff"
                  checked={form.role === "staff"}
                  onChange={() => {
                    setForm((prev) => ({
                      ...prev,
                      role: "staff",
                      owner_password: "",
                    }));
                  }}
                />
                พนักงาน
              </label>
            </div>
          </div>

          {form.role === "owner" && (
            <div className="register-owner-box">
              <label htmlFor="reg-owner-code">รหัสยืนยันเจ้าของร้าน</label>
              <div className="register-password-wrap">
                <input
                  id="reg-owner-code"
                  type={showOwnerPassword ? "text" : "password"}
                  placeholder="กรอกรหัสยืนยันเจ้าของร้าน"
                  value={form.owner_password}
                  onChange={(e) => update("owner_password", e.target.value)}
                  required
                />
                <button type="button" className="register-eye"
                  onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                  aria-label={showOwnerPassword ? "ซ่อนรหัส" : "แสดงรหัส"}>
                  <EyeIcon visible={showOwnerPassword} />
                </button>
              </div>
              <small>ต้องมีรหัสยืนยันสำหรับการสมัครบัญชีเจ้าของร้าน</small>
            </div>
          )}

          {error && <p className="register-error" role="alert">{error}</p>}

          <button
            type="submit"
            className="register-submit"
            disabled={loading}
          >
            {loading ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
          </button>

          <p className="register-login-link">
            มีบัญชีอยู่แล้ว? <a href="/login">เข้าสู่ระบบ</a>
          </p>
        </form>
      </div>

      {success && (
        <div className="register-modal-backdrop">
          <div className="register-modal" role="dialog" aria-modal="true">
            <div className="register-success-icon">✓</div>
            <h2>สมัครสมาชิกสำเร็จ</h2>
            <p>สามารถเข้าสู่ระบบได้ทันที</p>
            <div className="register-success-info">
              <p>ชื่อผู้ใช้: <strong>{form.username}</strong></p>
              <p>ประเภท: <strong>{form.role === "owner" ? "เจ้าของร้าน" : "พนักงาน"}</strong></p>
            </div>
            <button onClick={() => window.location.replace("/login")}>
              ไปหน้าเข้าสู่ระบบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
