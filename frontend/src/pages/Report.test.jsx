import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Report from "./Report";

vi.mock("chart.js/auto", () => ({
  default: class MockChart {
    destroy() {}
  },
}));

const sampleReport = {
  ok: true,
  total_sales: 350,
  total_orders: 2,
  items_sold: 5,
  orders: [
    { id: 12, created_at: "2026-10-28 14:30:00", full_name: "พนักงานหนึ่ง", total: 350, payment_method: "cash" },
  ],
  categories: [{ category: "เครื่องดื่ม", sales: 350 }],
  daily: [{ day: "2026-10-28", total: 350 }],
};

function jsonResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) };
}

function mockAPI({ role = "owner", report = sampleReport, invoice, reportStatus = 200 } = {}) {
  const invoiceData = invoice || {
    ok: true,
    order: { id: 12, created_at: "2026-10-28 14:30:00", full_name: "พนักงานหนึ่ง", total: 350, payment_method: "cash", slip_trans_ref: "REF-123" },
    items: [{ name: "น้ำดื่ม", quantity: 2, price: 175 }],
  };
  const fetchMock = vi.fn(async (url) => {
    const path = String(url);
    if (path.includes("/api/me.php")) return jsonResponse({ ok: true, user: { role } });
    if (path.includes("order_id=")) return jsonResponse(invoiceData);
    if (path.includes("/api/report.php")) return jsonResponse(report, reportStatus);
    throw new Error(`Unexpected API: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderOwner(options) {
  const fetchMock = mockAPI(options);
  render(<Report />);
  await screen.findByText("เครื่องดื่ม");
  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal("alert", vi.fn());
  vi.stubGlobal("print", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Report page", () => {
  it("โหลดรายงานของเจ้าของร้านและแสดงสรุปยอดขาย", async () => {
    const fetchMock = await renderOwner();
    expect(screen.getByRole("heading", { name: "รายงานยอดขาย" })).toBeTruthy();
    expect(screen.getByText("เครื่องดื่ม")).toBeTruthy();
    expect(screen.getByText("B000012")).toBeTruthy();
    expect(screen.getByText("พนักงานหนึ่ง")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/me.php", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("start=") && String(url).includes("end="))).toBe(true);
  });

  it("ไม่อนุญาตให้พนักงานดูรายงานและไม่เรียก API รายงาน", async () => {
    const fetchMock = mockAPI({ role: "staff" });
    render(<Report />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "เฉพาะเจ้าของร้านเท่านั้นที่ดูรายงานยอดขายได้");
    expect(screen.queryByRole("button", { name: "ค้นหา" })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/report.php"))).toBe(false);
  });

  it("ตรวจสอบช่วงวันที่ก่อนค้นหา", async () => {
    const fetchMock = await renderOwner();
    const start = screen.getByLabelText("วันที่เริ่มต้น");
    const end = screen.getByLabelText("วันที่สิ้นสุด");
    fireEvent.change(start, { target: { value: "2026-11-30" } });
    fireEvent.change(end, { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/report.php"))).toHaveLength(1);
  });

  it("ค้นหาตามวันที่ที่เลือก", async () => {
    const fetchMock = await renderOwner();
    fireEvent.change(screen.getByLabelText("วันที่เริ่มต้น"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("วันที่สิ้นสุด"), { target: { value: "2026-10-28" } });
    fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/report.php"))).toHaveLength(2));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("start=2026-10-01") && String(url).includes("end=2026-10-28"))).toBe(true);
  });

  it("เปิดรายละเอียดใบเสร็จและปิดหน้าต่างได้", async () => {
    const fetchMock = await renderOwner();
    fireEvent.click(screen.getByRole("button", { name: "B000012" }));
    const dialog = await screen.findByRole("dialog", { name: "รายละเอียดใบเสร็จ" });
    expect(await within(dialog).findByText("น้ำดื่ม")).toBeTruthy();
    expect(within(dialog).getByText("REF-123")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("order_id=12"))).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "ปิด" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("แสดงข้อความเมื่อไม่มีข้อมูลยอดขาย", async () => {
    mockAPI({ report: { ok: true, total_sales: 0, total_orders: 0, items_sold: 0, orders: [], categories: [], daily: [] } });
    render(<Report />);
    expect(await screen.findByText("ไม่พบรายการขายในช่วงวันที่เลือก")).toBeTruthy();
    expect(screen.getByText("ยังไม่มียอดขายในช่วงวันที่เลือก")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export CSV" }).disabled).toBe(true);
  });

  it("แสดงข้อผิดพลาดเมื่อ API รายงานล้มเหลว", async () => {
    mockAPI({ report: { ok: false, message: "ไม่สามารถโหลดรายงานได้" }, reportStatus: 500 });
    render(<Report />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "ไม่สามารถโหลดรายงานได้");
  });

  it("สั่งพิมพ์รายงานได้", async () => {
    await renderOwner();
    fireEvent.click(screen.getByRole("button", { name: "พิมพ์รายงาน" }));
    expect(window.print).toHaveBeenCalledOnce();
  });
});
