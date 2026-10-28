
import { useState } from "react";
import "../styles/sidebar.css";

const menuItems = [
  { name: "Dashboard", path: "/dashboard" },
  { name: "POS ขายสินค้า", path: "/pos" },
  { name: "สินค้า", path: "/product" },
  { name: "สต็อกสินค้า", path: "/stock" },
  { name: "รายงานยอดขาย", path: "/report" },
  { name: "จัดการผู้ใช้งาน", path: "/users" },
  { name: "หน้าโปรไฟล์ / ตั้งค่า", path: "/profile" },
];

export default function Sidebar() {
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const path = window.location.pathname;

  async function logout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError("");

    try {
      const response = await fetch("/api/logout.php", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      const raw = await response.text();
      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          `เซิร์ฟเวอร์ไม่ได้ส่ง JSON (HTTP ${response.status}) กรุณาตรวจสอบว่า PHP Backend พอร์ต 8000 ทำงานอยู่ และ Vite proxy /api ถูกต้อง`
        );
      }

      if (!response.ok || data.ok !== true) {
        throw new Error(
          data.message ||
            `ออกจากระบบไม่สำเร็จ (HTTP ${response.status})`
        );
      }

      sessionStorage.clear();
      window.location.replace("/login");
    } catch (error) {
      setLogoutError(
        error.message || "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ"
      );
      setLoggingOut(false);
    }
  }

  return (
    <aside className="shared-sidebar">
      <div className="shared-sidebar-logo">🛒</div>

      <div className="shared-sidebar-shop">
        ร้านขายของชำ
      </div>

      <nav
        className="shared-sidebar-nav"
        aria-label="เมนูหลัก"
      >
        {menuItems.map((item) => (
          <a
            key={item.path}
            href={item.path}
            className={`shared-sidebar-link${
              path === item.path ||
              (item.path === "/pos" && path === "/")
                ? " active"
                : ""
            }`}
          >
            {item.name}
          </a>
        ))}
      </nav>

      <button
        type="button"
        className="shared-sidebar-logout"
        onClick={logout}
        disabled={loggingOut}
      >
        {loggingOut
          ? "กำลังออกจากระบบ..."
          : "ออกจากระบบ"}
      </button>

      {logoutError && (
        <p
          className="shared-sidebar-error"
          role="alert"
        >
          {logoutError}
        </p>
      )}
    </aside>
  );
}
