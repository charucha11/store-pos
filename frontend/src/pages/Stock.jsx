
import { useCallback, useEffect, useMemo, useState } from "react";
import "../styles/stock.css";
import Sidebar from "../components/Sidebar";

const API = "/api/products.php";
const ME_API = "/api/me.php";
const HISTORY_API = "/api/stock-history.php";

const THB = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
});

const money = (amount) => THB.format(Number(amount) || 0);

function statusOf(stock) {
  if (stock === 0) return { key: "out", label: "หมด" };
  if (stock <= 5) return { key: "low", label: "ใกล้หมด" };
  return { key: "normal", label: "ปกติ" };
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
  });

  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${response.status})`
    );
  }

  if (!response.ok || !data.ok) {
    throw new Error(
      data.message || `ดำเนินการไม่สำเร็จ (HTTP ${response.status})`
    );
  }

  return data;
}

export default function Stock() {
  const [products, setProducts] = useState([]);
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // ปรับจำนวนสต็อก
  const [editing, setEditing] = useState(null);
  const [stockInput, setStockInput] = useState("");

  // รับสินค้าเข้า
  const [receiving, setReceiving] = useState(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveNote, setReceiveNote] = useState("");

  const isOwner = user?.role === "owner";

  const loadProducts = useCallback(async (signal) => {
    const data = await fetchJSON(
      API,
      signal ? { signal } : {}
    );

    setProducts(
      (data.products || []).map((p) => ({
        id: Number(p.id),
        code: String(p.code ?? ""),
        name: String(p.name ?? ""),
        price: Number(p.price),
        stock: Number(p.stock),
      }))
    );
  }, []);

  const loadHistory = useCallback(async (signal) => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const data = await fetchJSON(HISTORY_API, signal ? { signal } : {});
      if (!signal?.aborted) setHistory(data.history || []);
    } catch (err) {
      if (err.name !== "AbortError") setHistoryError(err.message);
    } finally {
      if (!signal?.aborted) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function init() {
      try {
        setLoading(true);
        setError("");

        const identity = await fetchJSON(ME_API, {
          signal: controller.signal,
        });

        if (!identity.user) {
          throw new Error(
            "ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่"
          );
        }

        setUser(identity.user);
        await loadProducts(controller.signal);
        if (identity.user.role === "owner") await loadHistory(controller.signal);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => controller.abort();
  }, [loadProducts, loadHistory]);

  const summary = useMemo(() => ({
    total: products.length,
    value: products.reduce(
      (total, p) => total + p.price * p.stock,
      0
    ),
    low: products.filter(
      (p) => p.stock > 0 && p.stock <= 5
    ).length,
    out: products.filter((p) => p.stock === 0).length,
  }), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("th-TH");

    return products.filter((p) => {
      const matchesSearch =
        !q ||
        `${p.code} ${p.name}`
          .toLocaleLowerCase("th-TH")
          .includes(q);

      const matchesStatus =
        statusFilter === "all" ||
        statusOf(p.stock).key === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [products, search, statusFilter]);

  function openEdit(product) {
    if (!isOwner) return;

    setError("");
    setNotice("");
    setStockInput(String(product.stock));
    setEditing(product);
  }

  function openReceive(product) {
    if (!isOwner) return;

    setError("");
    setNotice("");
    setReceiveQty("");
    setReceiveNote("");
    setReceiving(product);
  }

  async function saveStock(event) {
    event.preventDefault();

    if (!editing || !isOwner || saving) return;

    const newStock = Number(stockInput);

    if (
      !/^\d+$/.test(stockInput) ||
      !Number.isSafeInteger(newStock) ||
      newStock < 0 ||
      newStock > 9999
    ) {
      setError("กรุณากรอกจำนวนสต็อก 0–9999 ชิ้น");
      return;
    }

    const form = new FormData();
    form.append("action", "set_stock");
    form.append("id", String(editing.id));
    form.append("stock", stockInput);

    try {
      setSaving(true);
      setError("");
      setNotice("");

      await fetchJSON(API, {
        method: "POST",
        body: form,
      });

      await loadProducts();

      setNotice(
        `ปรับจำนวนสต็อก ${editing.name} เรียบร้อยแล้ว`
      );

      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveReceive(event) {
    event.preventDefault();

    if (!receiving || !isOwner || saving) return;

    const qty = Number(receiveQty);

    if (
      !/^[1-9]\d*$/.test(receiveQty) ||
      !Number.isSafeInteger(qty) ||
      qty < 1 ||
      qty > 9999
    ) {
      setError("กรุณากรอกจำนวนรับเข้า 1–9999 ชิ้น");
      return;
    }

    if (receiveNote.length > 255) {
      setError("หมายเหตุต้องไม่เกิน 255 ตัวอักษร");
      return;
    }

    const form = new FormData();
    form.append("action", "stock_in");
    form.append("id", String(receiving.id));
    form.append("quantity", String(qty));
    form.append("note", receiveNote.trim());

    try {
      setSaving(true);
      setError("");
      setNotice("");

      const result = await fetchJSON(API, {
        method: "POST",
        body: form,
      });

      await loadProducts();
      await loadHistory();

      setNotice(
        `รับสินค้า ${receiving.name} จำนวน ${qty} ชิ้นสำเร็จ ` +
        `(คงเหลือ ${result.stock_after} ชิ้น)`
      );

      setReceiving(null);
      setReceiveQty("");
      setReceiveNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stock-root">
      <Sidebar />

      <main className="stock-main">
        <h1>สต็อกสินค้า</h1>

        <section
          className="stock-summary"
          aria-label="สรุปสต็อก"
        >
          <div className="stock-summary-card stock-blue">
            <h3>สินค้าทั้งหมด</h3>
            <strong>{summary.total}</strong>
            <small>รายการ</small>
          </div>

          <div className="stock-summary-card stock-green">
            <h3>มูลค่าสินค้าคงเหลือ</h3>
            <strong>{money(summary.value)}</strong>
            <small>มูลค่ารวม</small>
          </div>

          <div className="stock-summary-card stock-yellow">
            <h3>สินค้าใกล้หมด</h3>
            <strong>{summary.low}</strong>
            <small>รายการ (1–5 ชิ้น)</small>
          </div>

          <div className="stock-summary-card stock-pink">
            <h3>สินค้าหมด</h3>
            <strong>{summary.out}</strong>
            <small>รายการ</small>
          </div>
        </section>

        {error && (
          <p role="alert" className="stock-error">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="stock-notice">
            {notice}
          </p>
        )}

        <section className="stock-card">
          <div className="stock-card-heading">
            รายการสต็อกสินค้า
          </div>

          <div className="stock-tools">
            <label className="stock-search-wrap">
              <span aria-hidden="true">🔍</span>
              <input
                type="search"
                placeholder="ค้นหารหัสสินค้า หรือชื่อสินค้า..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="ค้นหาสินค้า"
              />
            </label>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value)
              }
              aria-label="กรองสถานะสต็อก"
            >
              <option value="all">สถานะทั้งหมด</option>
              <option value="normal">ปกติ</option>
              <option value="low">ใกล้หมด</option>
              <option value="out">หมด</option>
            </select>
          </div>

          {loading ? (
            <p className="stock-empty">
              กำลังโหลดสินค้า...
            </p>
          ) : (
            <div className="stock-table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>รหัสสินค้า</th>
                    <th>ชื่อสินค้า</th>
                    <th>ราคา</th>
                    <th>คงเหลือ</th>
                    <th>มูลค่า</th>
                    <th>สถานะ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.length ? (
                    filtered.map((p) => {
                      const status = statusOf(p.stock);

                      return (
                        <tr key={p.id}>
                          <td>{p.code}</td>
                          <td>{p.name}</td>
                          <td>{money(p.price)}</td>
                          <td>{p.stock}</td>
                          <td>
                            {money(p.price * p.stock)}
                          </td>
                          <td>
                            <span
                              className={`stock-status stock-status-${status.key}`}
                            >
                              {status.label}
                            </span>
                          </td>
                          <td>
                            {isOwner ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  type="button"
                                  className="stock-edit-btn"
                                  onClick={() =>
                                    openReceive(p)
                                  }
                                  style={{
                                    background: "#dff5e8",
                                    color: "#176b43",
                                  }}
                                >
                                  + รับสินค้าเข้า
                                </button>

                                <button
                                  type="button"
                                  className="stock-edit-btn"
                                  onClick={() =>
                                    openEdit(p)
                                  }
                                >
                                  ✏️ แก้ไข
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: "#64748b", fontSize: 13 }}>
                                เฉพาะเจ้าของร้าน
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="stock-empty"
                      >
                        ไม่พบสินค้าที่ค้นหา
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isOwner && (
          <section className="stock-card" style={{ marginTop: 24 }}>
            <div className="stock-card-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span>📋 ประวัติการรับสินค้าเข้าสต็อก</span>
              <button type="button" className="stock-edit-btn" onClick={() => { void loadHistory(); }} disabled={historyLoading}>
                {historyLoading ? "กำลังโหลด..." : "↻ รีเฟรชประวัติ"}
              </button>
            </div>
            {historyError && <p role="alert" className="stock-error">{historyError}</p>}
            {historyLoading && history.length === 0 ? (
              <p className="stock-empty">กำลังโหลดประวัติ...</p>
            ) : (
              <div className="stock-table-wrap">
                <table className="stock-table">
                  <thead><tr>
                    <th>วันที่รับสินค้า</th>
                    <th>รหัสสินค้า</th>
                    <th>ชื่อสินค้า</th>
                    <th>จำนวนรับเข้า</th>
                    <th>หมายเหตุ</th>
                    <th>ผู้บันทึก (ID)</th>
                  </tr></thead>
                  <tbody>
                    {history.length ? history.map((h) => (
                      <tr key={h.id}>
                        <td>{h.created_at || "-"}</td>
                        <td>{h.product_code || `#${h.product_id}`}</td>
                        <td>{h.product_name || "ไม่พบสินค้า"}</td>
                        <td>+{h.quantity} ชิ้น</td>
                        <td>{h.note || "-"}</td>
                        <td>{h.user_id ?? "-"}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="stock-empty">ยังไม่มีประวัติรับสินค้าเข้า</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: 12, color: "#64748b", padding: "8px 16px 16px" }}>แสดงรายการรับสินค้าเข้าล่าสุดไม่เกิน 100 รายการ เฉพาะเจ้าของร้าน</p>
          </section>
        )}
      </main>

      {editing && (
        <div
          className="stock-modal-backdrop"
        >
          <form
            className="stock-modal"
            onSubmit={saveStock}
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-modal-title"
          >
            <h2 id="stock-modal-title">
              ปรับจำนวนสินค้า
            </h2>

            <label>
              ชื่อสินค้า
              <input
                type="text"
                value={editing.name}
                readOnly
              />
            </label>

            <label>
              จำนวนคงเหลือ
              <input
                type="number"
                min="0"
                max="9999"
                step="1"
                required
                value={stockInput}
                onChange={(e) =>
                  setStockInput(e.target.value)
                }
                autoFocus
              />
            </label>

            <div className="stock-modal-actions">
              <button
                type="button"
                className="stock-cancel"
                disabled={saving}
                onClick={() => setEditing(null)}
              >
                ยกเลิก
              </button>

              <button
                type="submit"
                className="stock-save"
                disabled={saving}
              >
                {saving
                  ? "กำลังบันทึก..."
                  : "บันทึก"}
              </button>
            </div>
          </form>
        </div>
      )}

      {receiving && (
        <div
          className="stock-modal-backdrop"
        >
          <form
            className="stock-modal"
            onSubmit={saveReceive}
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-receive-title"
          >
            <h2 id="stock-receive-title">
              📦 รับสินค้าเข้าสต็อก
            </h2>

            <label>
              ชื่อสินค้า
              <input
                type="text"
                value={receiving.name}
                readOnly
              />
            </label>

            <label>
              จำนวนคงเหลือปัจจุบัน
              <input
                type="text"
                value={`${receiving.stock} ชิ้น`}
                readOnly
              />
            </label>

            <label>
              จำนวนรับเข้า
              <input
                type="number"
                min="1"
                max="9999"
                step="1"
                required
                value={receiveQty}
                onChange={(e) =>
                  setReceiveQty(e.target.value)
                }
                placeholder="ระบุจำนวนสินค้า"
                autoFocus
              />
            </label>

            <label>
              หมายเหตุ (ไม่บังคับ)
              <input
                type="text"
                maxLength={255}
                value={receiveNote}
                onChange={(e) =>
                  setReceiveNote(e.target.value)
                }
                placeholder="เช่น รับสินค้าจากผู้จำหน่าย"
              />
            </label>

            <div className="stock-modal-actions">
              <button
                type="button"
                className="stock-cancel"
                disabled={saving}
                onClick={() =>
                  setReceiving(null)
                }
              >
                ยกเลิก
              </button>

              <button
                type="submit"
                className="stock-save"
                disabled={saving}
              >
                {saving
                  ? "กำลังบันทึก..."
                  : "ยืนยันรับสินค้า"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
