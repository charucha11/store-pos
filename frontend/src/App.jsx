
import { useEffect, useState } from "react";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Pos from "./pages/Pos";
import Receipt from "./pages/Receipt";
import Dashboard from "./pages/Dashboard";
import Product from "./pages/Product";
import Stock from "./pages/Stock";
import Report from "./pages/Report";
import Users from "./pages/Users";
import Profile from "./pages/Profile";

export default function App() {
  const [auth, setAuth] = useState("loading");
  const path = window.location.pathname;

  useEffect(() => {
    const controller = new AbortController();

    async function checkLogin() {
      try {
        const response = await fetch("/api/me.php", {
          credentials: "include",
          signal: controller.signal,
        });

        const data = await response.json();

        if (!controller.signal.aborted) {
          setAuth(
            response.ok && data.ok && data.user
              ? "authenticated"
              : "guest"
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setAuth("guest");
        }
      }
    }

    checkLogin().catch((error) => {
  if (!controller.signal.aborted) {
    console.error("Login check failed:", error);
    setAuth("guest");
  }
});
    return () => controller.abort();
  }, []);

  // หน้า Register เปิดได้โดยไม่ต้อง Login
  if (path === "/register") {
    return <Register />;
  }

  // กำลังตรวจสอบ Session
  if (auth === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "#244968",
        }}
      >
        กำลังตรวจสอบการเข้าสู่ระบบ...
      </div>
    );
  }

  // ยังไม่ได้เข้าสู่ระบบ
  if (auth === "guest") {
    return <Login />;
  }

  // Login แล้ว ไม่ต้องกลับไปหน้า Login
  if (path === "/login") {
    window.location.replace("/dashboard");
    return null;
  }

  // หน้าต่าง ๆ ของระบบ
  if (path === "/receipt") return <Receipt />;
  if (path === "/dashboard") return <Dashboard />;
  if (path === "/product") return <Product />;
  if (path === "/stock") return <Stock />;
  if (path === "/report") return <Report />;
  if (path === "/users") return <Users />;
  if (path === "/profile") return <Profile />;

  // หน้าแรก
  return <Pos />;
}
