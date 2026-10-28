
import { useEffect, useState } from "react";
import "../styles/login.css";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 50);
    return () => clearTimeout(timer);
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน");
      return;
    }

    setLoading(true);

    try {
      const form = new FormData();
      form.append("username", username.trim());
      form.append("password", password);

      const response = await fetch("/api/login.php", {
        method: "POST",
        credentials: "include",
        body: form,
      });

      // อ่านข้อมูลจาก PHP เป็นข้อความก่อน
      const raw = await response.text();

      if (!raw.trim()) {
        throw new Error(
          "เซิร์ฟเวอร์ไม่ส่งข้อมูลกลับมา กรุณาตรวจสอบ PHP Server"
        );
      }

      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        console.error("Login API returned invalid JSON:", raw);
        throw new Error(
          "ข้อมูลที่ได้รับจากเซิร์ฟเวอร์ไม่ถูกต้อง"
        );
      }

      if (!response.ok || !data.ok) {
        throw new Error(
          data.message || "เข้าสู่ระบบไม่สำเร็จ"
        );
      }

      window.location.replace("/dashboard");

    } catch (err) {
      console.error("Login error:", err);
      setError(
        err.message || "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div
        className={`login-container ${
          show ? "login-show" : ""
        }`}
      >
        <div className="login-image">
          <img
            src="/IMG_5064.png"
            alt="ร้านขายของชำ"
          />
        </div>

        <form
          className="login-form"
          onSubmit={handleLogin}
        >
          <div className="login-cart">🛒</div>

          <h1>ร้านขายของชำ</h1>

          <p className="login-subtitle">
            ระบบจัดการร้านขายของชำ
          </p>

          <label htmlFor="username">
            ชื่อผู้ใช้งาน
          </label>

          <input
            id="username"
            type="text"
            placeholder="กรอกชื่อผู้ใช้งาน"
            value={username}
            onChange={(e) =>
              setUsername(e.target.value)
            }
            autoComplete="username"
            required
          />

          <label htmlFor="password">
            รหัสผ่าน
          </label>

          <div className="login-password-wrap">
            <input
              id="password"
              type={showPw ? "text" : "password"}
              placeholder="กรอกรหัสผ่าน"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              autoComplete="current-password"
              required
            />

            <button
              type="button"
              className="login-eye"
              onClick={() => setShowPw(!showPw)}
              aria-label={
                showPw ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
              }
            >
              {showPw ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.94 17.94A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a17.6 17.6 0 0 1 4.06-5.06" />
                  <path d="M9.9 4.24A9.7 9.7 0 0 1 12 4c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              )}
            </button>
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading
              ? "กำลังเข้าสู่ระบบ..."
              : "เข้าสู่ระบบ"}
          </button>

          <p className="login-register">
            ยังไม่มีบัญชี?{" "}
            <a href="/register">
              สมัครบัญชี
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
