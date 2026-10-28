import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Dashboard from "./Dashboard";

const chartMock = vi.hoisted(() => ({ instances: [], destroy: vi.fn() }));
vi.mock("chart.js/auto", () => ({
  default: class MockChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      chartMock.instances.push(this);
    }
    destroy() { chartMock.destroy(); }
  },
}));

const baseData = {
  ok: true,
  today_sales: 12500,
  today_orders: 12,
  product_count: 40,
  low_count: 2,
  out_count: 1,
  low_stock: [
    { id: 1, name: "น้ำดื่ม", stock: 0 },
    { id: 2, name: "ข้าวสาร", stock: 3 },
  ],
  top_products: [{ id: 3, name: "นมสด", qty: 9 }],
  categories: [
    { category: "เครื่องดื่ม", sales: 75 },
    { category: "อาหาร", sales: 25 },
  ],
  daily: [{ day: "2026-10-28", total: 1200 }],
};

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: vi.fn().mockResolvedValue(JSON.stringify(data)) };
}

function mockApi({ identity = { ok: true, user: { full_name: "ผู้จัดการร้าน", role: "owner" } }, dashboard = baseData, identityStatus = 200, dashboardStatus = 200 } = {}) {
  globalThis.fetch = vi.fn((url) => {
    if (url === "/api/me.php") return Promise.resolve(response(identity, identityStatus));
    if (url === "/api/dashboard.php") return Promise.resolve(response(dashboard, dashboardStatus));
    return Promise.reject(new Error(`Unexpected API request: ${url}`));
  });
}

async function loaded() {
  await screen.findByText("ยอดขายวันนี้");
}

beforeEach(() => {
  chartMock.instances.length = 0;
  chartMock.destroy.mockClear();
  mockApi();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Dashboard (real component)", () => {
  it("แสดงสถานะกำลังโหลดและดึงข้อมูลผู้ใช้ก่อนข้อมูล Dashboard", async () => {
    let resolveIdentity;
    globalThis.fetch = vi.fn((url) => {
      if (url === "/api/me.php") return new Promise((resolve) => { resolveIdentity = resolve; });
      return Promise.resolve(response(baseData));
    });
    render(<Dashboard />);
    expect(screen.getByRole("status").textContent).toContain("กำลังโหลด");
    resolveIdentity(response({ ok: true, user: { username: "owner" } }));
    await loaded();
    expect(globalThis.fetch.mock.calls[0][0]).toBe("/api/me.php");
    expect(globalThis.fetch.mock.calls[1][0]).toBe("/api/dashboard.php");
    expect(screen.getByText(/owner/)).toBeTruthy();
  });

  it("แสดงยอดขาย จำนวนบิล จำนวนสินค้า และชื่อผู้ใช้", async () => {
    render(<Dashboard />);
    await loaded();
    expect(screen.getByText("฿12,500")).toBeTruthy();
    expect(screen.getByText("รายการขายวันนี้")).toBeTruthy();
    expect(screen.getByText("สินค้าในระบบ")).toBeTruthy();
    expect(within(document.querySelector(".db-profile")).getByText(/ผู้จัดการร้าน/)).toBeTruthy();
  });

  it("แสดงสินค้าขายดีและสินค้าสต็อกต่ำ รวมถึงสินค้าหมด", async () => {
    render(<Dashboard />);
    await loaded();
    expect(screen.getByText(/นมสด/)).toBeTruthy();
    expect(screen.getByText(/น้ำดื่ม/)).toBeTruthy();
    expect(screen.getByText(/ข้าวสาร/)).toBeTruthy();
    expect(screen.getByText("หมด")).toBeTruthy();
    expect(screen.getByText("3 ชิ้น")).toBeTruthy();
  });

  it("คำนวณสัดส่วนยอดขายแต่ละหมวดหมู่", async () => {
    render(<Dashboard />);
    await loaded();
    const categoryRows = document.querySelectorAll(".db-category-row");
    expect(categoryRows).toHaveLength(2);
    expect(categoryRows[0].textContent).toContain("เครื่องดื่ม");
    expect(categoryRows[0].textContent).toContain("75");
    expect(categoryRows[1].textContent).toContain("25");
  });

  it("สร้างกราฟยอดขายและทำลายกราฟเมื่อออกจากหน้า", async () => {
    const { unmount } = render(<Dashboard />);
    await loaded();
    await waitFor(() => expect(chartMock.instances.length).toBeGreaterThan(0));
    const config = chartMock.instances.at(-1).config;
    expect(config.type).toBe("line");
    expect(config.data.datasets[0].data).toEqual([1200]);
    unmount();
    expect(chartMock.destroy).toHaveBeenCalled();
  });

  it("เปิดและปิดการแจ้งเตือนจำนวนสินค้าที่ต้องตรวจสอบ", async () => {
    render(<Dashboard />);
    await loaded();
    const button = screen.getByRole("button", { name: "การแจ้งเตือน" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/มีสินค้า 3 รายการที่ใกล้หมดหรือหมดสต็อก/)).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByText(/มีสินค้า 3 รายการที่ใกล้หมดหรือหมดสต็อก/)).toBeNull();
  });

  it("แสดงข้อความเมื่อไม่มีข้อมูลการขายและไม่มีสินค้าใกล้หมด", async () => {
    mockApi({ dashboard: { ...baseData, today_sales: 0, low_count: 0, out_count: 0, low_stock: [], top_products: [], categories: [], daily: [] } });
    render(<Dashboard />);
    await loaded();
    expect(screen.getAllByText("ยังไม่มีข้อมูลการขาย")).toHaveLength(2);
    expect(screen.getByText(/สินค้าทั้งหมดมีจำนวนเพียงพอ/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "การแจ้งเตือน" }));
    expect(screen.getByText("ไม่มีสินค้าที่ต้องแจ้งเตือน")).toBeTruthy();
  });

  it("แสดงข้อผิดพลาดจาก API Dashboard", async () => {
    mockApi({ dashboard: { ok: false, message: "ระบบรายงานไม่พร้อมใช้งาน" }, dashboardStatus: 500 });
    render(<Dashboard />);
    expect((await screen.findByRole("alert")).textContent).toContain("ระบบรายงานไม่พร้อมใช้งาน");
    expect(screen.queryByText("ยอดขายวันนี้")).toBeNull();
  });

  it("แสดงข้อผิดพลาดเมื่อ API ส่งข้อความที่ไม่ใช่ JSON", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url === "/api/me.php") return Promise.resolve(response({ ok: true, user: { username: "owner" } }));
      return Promise.resolve({ ok: true, status: 200, text: vi.fn().mockResolvedValue("<html>error</html>") });
    });
    render(<Dashboard />);
    expect((await screen.findByRole("alert")).textContent).toContain("ไม่ใช่ JSON");
  });

  it("แสดงข้อความผิดพลาดเมื่อออกจากระบบไม่สำเร็จ และเปิดให้ลองอีกครั้ง", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url === "/api/me.php") return Promise.resolve(response({ ok: true, user: { username: "owner" } }));
      if (url === "/api/dashboard.php") return Promise.resolve(response(baseData));
      if (url === "/api/logout.php") return Promise.resolve(response({ ok: false, message: "ออกจากระบบไม่ได้" }, 500));
      return Promise.reject(new Error("Unexpected request"));
    });
    render(<Dashboard />);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
    expect((await screen.findByRole("alert")).textContent).toContain("ออกจากระบบไม่ได้");
    expect(screen.getByRole("button", { name: "ออกจากระบบ" }).disabled).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/logout.php", expect.objectContaining({ method: "POST", credentials: "include" }));
  });

  it("รองรับข้อมูลรายการที่ไม่ใช่อาร์เรย์โดยไม่ทำให้หน้าล่ม", async () => {
    mockApi({ dashboard: { ...baseData, low_stock: null, top_products: {}, categories: "invalid", daily: null } });
    render(<Dashboard />);
    await loaded();
    expect(screen.getAllByText("ยังไม่มีข้อมูลการขาย")).toHaveLength(2);
    expect(screen.getByText(/สินค้าทั้งหมดมีจำนวนเพียงพอ/)).toBeTruthy();
  });

  it("มีลิงก์นำทางไปยังหน้ารายงาน สินค้า และสต็อก", async () => {
    render(<Dashboard />);
    await loaded();
    const nav = screen.getByRole("navigation", { name: "เมนูหลัก" });
    expect(within(nav).getByRole("link", { name: "รายงานยอดขาย" }).getAttribute("href")).toBe("/report");
    expect(within(nav).getByRole("link", { name: "สินค้า" }).getAttribute("href")).toBe("/product");
    expect(within(nav).getByRole("link", { name: "สต็อกสินค้า" }).getAttribute("href")).toBe("/stock");
  });
});
