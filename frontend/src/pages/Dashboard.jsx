
import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import "../styles/dashboard.css";

const API = "/api/dashboard.php";
const ME_API = "/api/me.php";

const COLORS = ["#315A7D", "#647687", "#8A9AA8", "#A9B8C4", "#C4CFD8"];

const money = (value) =>
  `฿${Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  })}`;

const count = (value) =>
  Number(value || 0).toLocaleString("th-TH");

const menu = [
  ["Dashboard", "/dashboard"],
  ["POS ขายสินค้า", "/"],
  ["สินค้า", "/product"],
  ["สต็อกสินค้า", "/stock"],
  ["รายงานยอดขาย", "/report"],
  ["จัดการผู้ใช้งาน", "/users"],
  ["หน้าโปรไฟล์ / ตั้งค่า", "/profile"],
];

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
  });

  const raw = await response.text();
  let result;

  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error(
      `เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${response.status})`
    );
  }

  if (response.status === 401) {
    window.location.replace("/login");
    throw new Error("กรุณาเข้าสู่ระบบใหม่");
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      result.message ||
        `โหลดข้อมูลไม่สำเร็จ (HTTP ${response.status})`
    );
  }

  return result;
}

function SalesChart({ daily = [] }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: daily.map((item) => {
          const date = new Date(`${item.day}T00:00:00`);

          return Number.isNaN(date.getTime())
            ? String(item.day)
            : date.toLocaleDateString("th-TH", {
                day: "numeric",
                month: "short",
              });
        }),
        datasets: [
          {
            label: "ยอดขาย",
            data: daily.map((item) => Number(item.total || 0)),
            borderColor: "#315A7D",
            backgroundColor: "rgba(49,90,125,0.10)",
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => money(value),
            },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [daily]);

  return (
    <div className="db-chart">
      <canvas ref={canvasRef} />
    </div>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        const identity = await fetchJSON(ME_API, {
          signal: controller.signal,
        });

        if (!identity.user) {
          window.location.replace("/login");
          return;
        }

        if (controller.signal.aborted) return;

        setUser(identity.user);

        const result = await fetchJSON(API, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setData(result);
        }
      } catch (err) {
        if (err.name !== "AbortError" && !controller.signal.aborted) {
          setError(err.message || "ไม่สามารถโหลดข้อมูลได้");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

       loadDashboard().catch((error) => {
      if (!controller.signal.aborted) {
        console.error("Failed to load dashboard:", error);
        setError(error.message || "ไม่สามารถโหลดข้อมูลได้");
        setLoading(false);
      }
    });

    return () => controller.abort();
  }, []);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setError("");

    try {
      const response = await fetch("/api/logout.php", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const raw = await response.text();
      let result;
      try {
        result = JSON.parse(raw);
      } catch {
        throw new Error(`เซิร์ฟเวอร์ไม่ได้ส่ง JSON (HTTP ${response.status})`);
      }

      if (!response.ok || result.ok !== true) {
        throw new Error(result.message || `ออกจากระบบไม่สำเร็จ (HTTP ${response.status})`);
      }

      sessionStorage.clear();
      window.location.replace("/login");
    } catch (err) {
      setError(err.message || "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
      setLoggingOut(false);
    }
  }

  const lowStock = Array.isArray(data?.low_stock)
    ? data.low_stock
    : [];

  const topProducts = Array.isArray(data?.top_products)
    ? data.top_products
    : [];

  const categories = Array.isArray(data?.categories)
    ? data.categories
    : [];

  const daily = Array.isArray(data?.daily)
    ? data.daily
    : [];

  const warningCount =
    Number(data?.low_count || 0) +
    Number(data?.out_count || 0);

  const categoryTotal = categories.reduce(
    (sum, item) => sum + Number(item.sales || 0),
    0
  );

  return (
    <div className="dashboard-page">
      <aside className="db-sidebar">
        <div className="db-shop-name">
          🛒 ร้านขายของชำ
        </div>

        <nav className="db-menu" aria-label="เมนูหลัก">
          {menu.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className={href === "/dashboard" ? "active" : ""}
            >
              {label}
            </a>
          ))}

          <button
            type="button"
            className="logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
          </button>
        </nav>
      </aside>

      <main className="db-content">
        <header className="db-header">
          <div>
            <h1>Dashboard</h1>

            <div className="db-date-time">
              📅{" "}
              {now.toLocaleDateString("th-TH", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {" | "}
              🕒 {now.toLocaleTimeString("th-TH")}
            </div>
          </div>

          <div className="db-header-right">
            <div className="db-notice-wrap">
              <button
                className="db-notification"
                type="button"
                aria-label="การแจ้งเตือน"
                aria-expanded={noticeOpen}
                onClick={() => setNoticeOpen((value) => !value)}
              >
                🔔
                {warningCount > 0 && (
                  <span className="db-notification-badge">
                    {warningCount}
                  </span>
                )}
              </button>

              {noticeOpen && (
                <div className="db-notice-panel">
                  <h3>🔔 แจ้งเตือน</h3>

                  <p>
                    {warningCount === 0
                      ? "ไม่มีสินค้าที่ต้องแจ้งเตือน"
                      : `มีสินค้า ${warningCount} รายการที่ใกล้หมดหรือหมดสต็อก`}
                  </p>

                  <a href="/stock">ไปดูสต็อกสินค้า</a>
                </div>
              )}
            </div>

            <div className="db-profile">
              👤{" "}
              {user?.full_name ||
                user?.username ||
                "ผู้ใช้งาน"}
            </div>
          </div>
        </header>

        {loading && (
          <p role="status">กำลังโหลดข้อมูล Dashboard...</p>
        )}

        {error && (
          <div className="db-error" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            <section className="db-summary">
              <a href="/report" className="db-card db-green">
                <span>ยอดขายวันนี้</span>
                <strong>{money(data.today_sales)}</strong>
              </a>

              <div className="db-card db-blue">
                <span>รายการขายวันนี้</span>
                <strong>{count(data.today_orders)}</strong>
                <small>บิล</small>
              </div>

              <a href="/product" className="db-card db-pink">
                <span>สินค้าในระบบ</span>
                <strong>{count(data.product_count)}</strong>
                <small>รายการ</small>
              </a>

              <a href="/stock" className="db-card db-yellow">
                <span>สินค้าใกล้หมด</span>
                <strong>{count(data.low_count)}</strong>
                <small>รายการ</small>
              </a>
            </section>

            <section className="db-grid">
              <div>
                <section className="db-box">
                  <h2>📊 ยอดขาย 7 วันล่าสุด</h2>
                  <SalesChart daily={daily} />
                </section>

                <section className="db-box">
                  <h2>🏆 สินค้าขายดี 5 อันดับ</h2>
                  <p className="db-sub">
                    นับจากการขายย้อนหลัง 30 วัน
                  </p>

                  {topProducts.length ? (
                    <ul className="db-product-list">
                      {topProducts.map((product, index) => (
                        <li key={`${product.id ?? index}-${index}`}>
                          <span>
                            {index + 1}. {product.name}
                          </span>
                          <span>{count(product.qty)} ชิ้น</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="db-empty">
                      ยังไม่มีข้อมูลการขาย
                    </p>
                  )}
                </section>
              </div>

              <div>
                <section className="db-box">
                  <h2>⚠️ สินค้าใกล้หมด</h2>

                  {lowStock.length ? (
                    lowStock.slice(0, 6).map((product, index) => (
                      <div
                        className="db-stock-row"
                        key={`${product.id ?? index}-${index}`}
                      >
                        <span>
                          {index + 1}. {product.name}
                        </span>

                        <strong>
                          {Number(product.stock) === 0
                            ? "หมด"
                            : `${count(product.stock)} ชิ้น`}
                        </strong>
                      </div>
                    ))
                  ) : (
                    <p className="db-empty">
                      ✅ สินค้าทั้งหมดมีจำนวนเพียงพอ
                    </p>
                  )}

                  <div className="db-view-all">
                    <a href="/stock">ดูทั้งหมด →</a>
                  </div>
                </section>

                <section className="db-box">
                  <h2>📦 สัดส่วนยอดขายตามหมวดหมู่</h2>

                  <p className="db-sub">
                    นับจากการขายย้อนหลัง 30 วัน
                  </p>

                  {categories.length ? (
                    categories.map((category, index) => (
                      <div
                        className="db-category-row"
                        key={`${category.category ?? index}-${index}`}
                      >
                        <span>
                          <i
                            style={{
                              background:
                                COLORS[index % COLORS.length],
                            }}
                          />
                          {category.category || "ไม่ระบุหมวด"}
                        </span>

                        <strong>
                          {categoryTotal
                            ? (
                                (Number(category.sales || 0) /
                                  categoryTotal) *
                                100
                              ).toFixed(0)
                            : "0"}
                          %
                        </strong>
                      </div>
                    ))
                  ) : (
                    <p className="db-empty">
                      ยังไม่มีข้อมูลการขาย
                    </p>
                  )}
                </section>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

