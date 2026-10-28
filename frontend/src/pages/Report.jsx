import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import "../styles/report.css";

const REPORT_API = "/api/report.php";
const ME_API = "/api/me.php";
const currency = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const money = (n) => currency.format(Number(n) || 0);
const billNo = (id) => `B${String(id).padStart(6, "0")}`;
const paymentName = (method) => method === "cash" ? "เงินสด" : "โอนเงิน (PromptPay)";
const dateText = (date) => {
  const [year, month, day] = String(date || "").slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "-";
};
const toISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = new Date();
const DEFAULT_END = toISO(today);
const DEFAULT_START = toISO(new Date(today.getFullYear(), today.getMonth(), 1));
const MENU = [
  ["Dashboard", "/dashboard"], ["POS ขายสินค้า", "/pos"],
  ["สินค้า", "/product"], ["สต็อกสินค้า", "/stock"],
  ["รายงานยอดขาย", "/report"], ["จัดการผู้ใช้งาน", "/users"],
  ["หน้าโปรไฟล์ / ตั้งค่า", "/profile"],
];

async function getJSON(url, options = {}) {
  const response = await fetch(url, { credentials: "include", ...options });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error(`เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${response.status})`); }
  if (!response.ok || !data.ok) throw new Error(data.message || `โหลดข้อมูลไม่สำเร็จ (HTTP ${response.status})`);
  return data;
}

function SalesChart({ daily }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const instance = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: daily.map((d) => dateText(d.day)),
        datasets: [{ label: "ยอดขาย", data: daily.map((d) => Number(d.total) || 0),
          backgroundColor: "rgba(61, 107, 142, 0.72)", borderColor: "#315d80", borderWidth: 1, borderRadius: 5 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => `฿${Number(v).toLocaleString("th-TH")}` } } },
      },
    });
    return () => instance.destroy();
  }, [daily]);
  return <div className="report-chart-box"><canvas ref={canvasRef} aria-label="กราฟยอดขายรายวัน" role="img" /></div>;
}

// Protect CSV from spreadsheet formula injection when names come from the database.
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export default function Report() {
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const requestRef = useRef(0);

  const loadReport = useCallback(async (from, to) => {
    if (!from || !to) { setError("กรุณาเลือกวันที่ให้ครบ"); return; }
    if (from > to) { setError("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด"); return; }
    const seq = ++requestRef.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ start: from, end: to });
      const data = await getJSON(`${REPORT_API}?${params}`);
      if (seq === requestRef.current) setReport({
        total_sales: Number(data.total_sales) || 0,
        total_orders: Number(data.total_orders) || 0,
        items_sold: Number(data.items_sold) || 0,
        orders: Array.isArray(data.orders) ? data.orders : [],
        categories: Array.isArray(data.categories) ? data.categories : [],
        daily: Array.isArray(data.daily) ? data.daily : [],
      });
    } catch (err) { if (seq === requestRef.current) setError(err.message); }
    finally { if (seq === requestRef.current) setLoading(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initializeReport() {
      try {
        const identity = await getJSON(ME_API);
        if (cancelled) return;
        setUser(identity.user || null);
        if (identity.user?.role !== "owner") { setError("เฉพาะเจ้าของร้านเท่านั้นที่ดูรายงานยอดขายได้"); setLoading(false); return; }
        await loadReport(DEFAULT_START, DEFAULT_END);
      } catch (err) { if (!cancelled) { setError(err.message); setLoading(false); } }
    }
    initializeReport().catch((err) => {
      if (!cancelled) {
        setError(err.message || "โหลดรายงานไม่สำเร็จ");
        setLoading(false);
      }
    });
    return () => { cancelled = true; requestRef.current += 1; };
  }, [loadReport]);

  const sales = useMemo(() => (report?.orders || []).map((o) => ({
    id: o.id, invoice: billNo(o.id), date: String(o.created_at || "").slice(0, 10),
    time: String(o.created_at || "").slice(11, 16), staff: o.full_name || "-",
    total: Number(o.total) || 0, payment: paymentName(o.payment_method),
  })), [report]);
  const categoryTotal = useMemo(() => (report?.categories || []).reduce((sum, item) => sum + (Number(item.sales) || 0), 0), [report]);

  async function showInvoice(id) {
    setSelectedOrder({}); setDetailLoading(true); setDetailError("");
    try {
      const data = await getJSON(`${REPORT_API}?${new URLSearchParams({ order_id: String(id) })}`);
      setSelectedOrder({ order: data.order, items: Array.isArray(data.items) ? data.items : [] });
    } catch (err) { setDetailError(err.message); }
    finally { setDetailLoading(false); }
  }
  function closeInvoice() { if (!detailLoading) { setSelectedOrder(null); setDetailError(""); } }
  function exportCSV() {
    if (!sales.length) { window.alert("ไม่มีข้อมูลสำหรับ Export"); return; }
    const rows = [
      ["ลำดับ", "เลขที่บิล", "วันที่", "เวลา", "พนักงานขาย", "ยอดรวม", "ชำระโดย"],
      ...sales.map((s, i) => [i + 1, s.invoice, s.date, s.time, s.staff, s.total.toFixed(2), s.payment]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "sales-report.csv";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="report-root">
    <aside className="report-sidebar">
      <div className="report-logo">🛒</div><div className="report-shop-name">ร้านขายของชำ</div>
      <nav aria-label="เมนูหลัก">{MENU.map(([label, href]) => <a key={href} href={href} className={`report-menu${href === "/report" ? " active" : ""}`}>{label}</a>)}</nav>
    </aside>
    <main className="report-main">
      <h1>รายงานยอดขาย</h1>
      {user?.role === "owner" && <>
        <form className="report-date-search" onSubmit={(event) => { event.preventDefault(); loadReport(start, end).catch((err) => setError(err.message || "ค้นหารายงานไม่สำเร็จ")); }}>
          <input aria-label="วันที่เริ่มต้น" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <span>—</span>
          <input aria-label="วันที่สิ้นสุด" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          <button type="submit" className="report-search-btn" disabled={loading}>ค้นหา</button>
          <button type="button" className="report-export-btn" onClick={exportCSV} disabled={!sales.length}>Export CSV</button>
          <button type="button" className="report-print-btn" onClick={() => window.print()}>พิมพ์รายงาน</button>
        </form>
        <section className="report-summary" aria-label="สรุปรายงาน">
          <div className="report-summary-card report-blue"><h3>ยอดขายรวม</h3><strong>{money(report?.total_sales)}</strong></div>
          <div className="report-summary-card report-green"><h3>ยอดขายเฉลี่ยต่อบิล</h3><strong>{money(report?.total_orders ? report.total_sales / report.total_orders : 0)}</strong></div>
          <div className="report-summary-card report-yellow"><h3>รายการขายทั้งหมด</h3><strong>{(report?.total_orders || 0).toLocaleString("th-TH")}</strong><small>บิล</small></div>
          <div className="report-summary-card report-red"><h3>สินค้าที่ขายทั้งหมด</h3><strong>{(report?.items_sold || 0).toLocaleString("th-TH")}</strong><small>ชิ้น</small></div>
        </section>
        {loading && <p role="status">กำลังโหลดรายงาน...</p>}
        <section className="report-card"><h2>กราฟยอดขายรายวัน</h2><SalesChart daily={report?.daily || []} /></section>
        <section className="report-card"><h2>ยอดขายแยกตามหมวดหมู่</h2><div className="report-table-wrapper"><table><thead><tr><th>หมวดหมู่</th><th>ยอดขาย</th><th>สัดส่วน</th></tr></thead><tbody>
          {report?.categories?.length ? report.categories.map((item, i) => <tr key={`${item.category}-${i}`}><td>{item.category || "ไม่ระบุหมวด"}</td><td>{money(item.sales)}</td><td>{categoryTotal > 0 ? ((Number(item.sales) || 0) / categoryTotal * 100).toFixed(0) : "0"}%</td></tr>) : <tr><td colSpan={3} className="report-empty">ยังไม่มียอดขายในช่วงวันที่เลือก</td></tr>}
        </tbody></table></div></section>
        <section className="report-card"><h2>รายการขาย</h2><div className="report-table-wrapper"><table><thead><tr><th>ลำดับ</th><th>เลขที่บิล</th><th>วันที่</th><th>เวลา</th><th>พนักงานขาย</th><th>ยอดรวม</th><th>ชำระโดย</th></tr></thead><tbody>
          {sales.length ? sales.map((sale, i) => <tr key={sale.id}><td>{i + 1}</td><td><button type="button" className="report-invoice-btn" onClick={() => { showInvoice(sale.id).catch((err) => { setDetailError(err.message || "โหลดรายละเอียดบิลไม่สำเร็จ"); setDetailLoading(false); }); }}>{sale.invoice}</button></td><td>{dateText(sale.date)}</td><td>{sale.time}</td><td>{sale.staff}</td><td>{money(sale.total)}</td><td><span className="report-payment-badge">{sale.payment}</span></td></tr>) : <tr><td colSpan={7} className="report-empty">ไม่พบรายการขายในช่วงวันที่เลือก</td></tr>}
        </tbody></table></div></section>
      </>}
      {error && <p role="alert" className="report-error">{error}</p>}
    </main>
    {selectedOrder && <div className="report-modal-backdrop">
      <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
        <header><h2 id="report-modal-title">รายละเอียดใบเสร็จ</h2><button type="button" onClick={closeInvoice} aria-label="ปิด">×</button></header>
        {detailLoading ? <p>กำลังโหลดรายละเอียด...</p> : detailError ? <p role="alert" className="report-error">{detailError}</p> : selectedOrder.order && <>
          <div className="report-detail-row"><span>เลขที่บิล</span><strong>{billNo(selectedOrder.order.id)}</strong></div>
          <div className="report-detail-row"><span>วันที่ / เวลา</span><strong>{dateText(selectedOrder.order.created_at)} {String(selectedOrder.order.created_at || "").slice(11, 16)}</strong></div>
          <div className="report-detail-row"><span>พนักงานขาย</span><strong>{selectedOrder.order.full_name || "-"}</strong></div>
          <div className="report-detail-items">{selectedOrder.items.map((item, i) => <div key={i} className="report-item-row"><span>{item.name} <small>× {item.quantity} @ {money(item.price)}</small></span><strong>{money(Number(item.quantity) * Number(item.price))}</strong></div>)}</div>
          <div className="report-detail-row"><span>ยอดรวม</span><strong>{money(selectedOrder.order.total)}</strong></div>
          <div className="report-detail-row"><span>ชำระโดย</span><strong>{paymentName(selectedOrder.order.payment_method)}</strong></div>
          {selectedOrder.order.slip_trans_ref && <div className="report-detail-row"><span>รหัสอ้างอิงสลิป</span><strong className="report-long-ref">{selectedOrder.order.slip_trans_ref}</strong></div>}
        </>}
      </section>
    </div>}
  </div>;
}
