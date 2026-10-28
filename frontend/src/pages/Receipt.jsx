import { useEffect, useState } from "react";
import "../styles/receipt.css";

const DEFAULT_SETTINGS = {
  shop_name: "ร้านขายของชำ",
  shop_address: "",
  shop_phone: "",
  receipt_footer: "ขอบคุณที่ใช้บริการ",
  receipt_show_phone: true,
  receipt_show_address: true,
  receipt_show_logo: false,
  receipt_logo_url: "",
  paper_size: "80mm",
};

const baht = (value) =>
  Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function readReceipt() {
  try {
    return JSON.parse(sessionStorage.getItem("lastOrder"));
  } catch {
    return null;
  }
}

// PHP settings may use boolean, integer, or string values.
// Normalize them without comparing incompatible types using ===.
function settingEnabled(value) {
  return value === true || String(value) === "1";
}

export default function Receipt() {
  const [order] = useState(readReceipt);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      try {
        const response = await fetch("/api/settings.php", {
          credentials: "include",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("โหลดการตั้งค่าไม่สำเร็จ");
        }

        const data = await response.json();

        if (!data.ok) {
          throw new Error(data.message || "โหลดการตั้งค่าไม่สำเร็จ");
        }

        if (!controller.signal.aborted) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...data.settings,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Receipt settings:", error);
        }
      }
    }

    void loadSettings();
    return () => controller.abort();
  }, []);

  const backToPOS = () => {
    window.location.href = "/pos";
  };

  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return (
      <div className="receipt-screen">
        <main className="receipt-paper">
          <div className="receipt-empty">
            <h2>ไม่พบข้อมูลบิล</h2>
            <p>กรุณากลับไปหน้าขายสินค้า</p>
            <button type="button" onClick={backToPOS}>
              กลับหน้าขายสินค้า
            </button>
          </div>
        </main>
      </div>
    );
  }

  const when = order.time ? new Date(order.time) : new Date();
  const sum = order.items.reduce(
    (total, item) => total + Number(item.qty) * Number(item.price),
    0
  );

  const showAddress = settingEnabled(settings.receipt_show_address);
  const showPhone = settingEnabled(settings.receipt_show_phone);
  const showLogo = settingEnabled(settings.receipt_show_logo);

  return (
    <div className="receipt-screen" data-paper-size={settings.paper_size}>
      <main className="receipt-paper">
        {/* ข้อมูลร้านค้า */}
        <div className="receipt-shop">
          {showLogo && settings.receipt_logo_url && (
            <img
              src={settings.receipt_logo_url}
              alt="โลโก้ร้านค้า"
              className="receipt-logo"
            />
          )}
          <h1>{settings.shop_name}</h1>
          {showAddress && settings.shop_address && <p>{settings.shop_address}</p>}
          {showPhone && settings.shop_phone && <p>โทร. {settings.shop_phone}</p>}
        </div>

        {/* เลขบิลและวันที่ */}
        <div className="receipt-meta">
          <span>บิลเลขที่ {order.orderId || "-"}</span>
          <span>
            {when.toLocaleString("th-TH", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        </div>

        <hr />

        {/* รายการสินค้า */}
        {order.items.map((item, index) => (
          <div className="receipt-item" key={index}>
            <span className="receipt-name">{item.name}</span>
            <span className="receipt-calc">{item.qty} x {baht(item.price)}</span>
            <span className="receipt-sum">
              {baht(Number(item.qty) * Number(item.price))}
            </span>
          </div>
        ))}

        <hr />

        {/* ยอดรวม */}
        <div className="receipt-total">
          <span>ยอดรวม</span>
          <span>{baht(order.total ?? sum)} บาท</span>
        </div>

        {/* วิธีชำระเงิน */}
        <div className="receipt-row">
          <span>ชำระโดย</span>
          <span>{order.method || "-"}</span>
        </div>

        {/* เงินสดและเงินทอน */}
        {order.cash != null && (
          <>
            <div className="receipt-row">
              <span>รับเงิน</span>
              <span>{baht(order.cash)} บาท</span>
            </div>
            <div className="receipt-row">
              <span>เงินทอน</span>
              <span>{baht(order.change)} บาท</span>
            </div>
          </>
        )}

        {/* เลขอ้างอิงสลิป */}
        {order.ref && (
          <div className="receipt-row">
            <span>เลขอ้างอิงสลิป</span>
            <span className="receipt-reference">{order.ref}</span>
          </div>
        )}

        {/* สถานะการชำระเงิน */}
        <div className="receipt-status">
          {order.verified ? "ตรวจสอบการชำระเงินแล้ว" : "ชำระเงินแล้ว"}
        </div>

        {/* ข้อความท้ายใบเสร็จ */}
        <div className="receipt-thanks">{settings.receipt_footer}</div>
      </main>

      {/* ปุ่มดำเนินการ */}
      <div className="receipt-actions">
        <button type="button" onClick={() => window.print()}>
          พิมพ์ใบเสร็จ
        </button>
        <button type="button" className="receipt-back" onClick={backToPOS}>
          กลับหน้าขายสินค้า
        </button>
      </div>
    </div>
  );
}
