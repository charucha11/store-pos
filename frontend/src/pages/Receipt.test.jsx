import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Receipt from "./Receipt";

const sampleOrder = {
  orderId: "INV-101",
  time: "2026-10-28T10:00:00",
  items: [
    { name: "น้ำดื่ม", qty: 2, price: 15 },
    { name: "ขนม", qty: 3, price: 20 },
  ],
  method: "เงินสด",
  cash: 100,
  change: 10,
  verified: false,
};

function saveOrder(order) {
  if (order === undefined) sessionStorage.removeItem("lastOrder");
  else sessionStorage.setItem("lastOrder", JSON.stringify(order));
}

function mockSettings(settings = {}) {
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, settings }),
  });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
  mockSettings();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("Receipt page", () => {
  it("แสดงข้อความเมื่อไม่มีข้อมูลบิล", () => {
    render(<Receipt />);
    expect(screen.getByText("ไม่พบข้อมูลบิล")).toBeInTheDocument();
    expect(screen.getByText("กรุณากลับไปหน้าขายสินค้า")).toBeInTheDocument();
  });

  it("แสดงหน้าว่างเมื่อรายการสินค้าเป็นค่าว่าง", () => {
    saveOrder({ items: [] });
    render(<Receipt />);
    expect(screen.getByText("ไม่พบข้อมูลบิล")).toBeInTheDocument();
  });

  it("ไม่ล้มเมื่อข้อมูลใน sessionStorage เป็น JSON ที่ไม่ถูกต้อง", () => {
    sessionStorage.setItem("lastOrder", "{invalid json");
    render(<Receipt />);
    expect(screen.getByText("ไม่พบข้อมูลบิล")).toBeInTheDocument();
  });

  it("แสดงเลขบิล รายการสินค้า และคำนวณยอดรวมเมื่อไม่ได้ส่ง total", () => {
    saveOrder(sampleOrder);
    render(<Receipt />);
    expect(screen.getByText("บิลเลขที่ INV-101")).toBeInTheDocument();
    expect(screen.getByText("น้ำดื่ม")).toBeInTheDocument();
    expect(screen.getByText("ขนม")).toBeInTheDocument();
    expect(screen.getByText("2 x 15.00")).toBeInTheDocument();
    expect(screen.getByText("3 x 20.00")).toBeInTheDocument();
    const total = document.querySelector(".receipt-total");
    expect(within(total).getByText("90.00 บาท")).toBeInTheDocument();
  });

  it("ใช้ยอดรวมจาก order.total หากมีค่า รวมถึง 0", () => {
    saveOrder({ ...sampleOrder, total: 0 });
    render(<Receipt />);
    expect(within(document.querySelector(".receipt-total")).getByText("0.00 บาท")).toBeInTheDocument();
  });

  it("แสดงวิธีชำระเงิน เงินสด เงินทอน และสถานะ", () => {
    saveOrder(sampleOrder);
    render(<Receipt />);
    expect(screen.getByText("เงินสด")).toBeInTheDocument();
    expect(screen.getByText("100.00 บาท")).toBeInTheDocument();
    expect(screen.getByText("10.00 บาท")).toBeInTheDocument();
    expect(screen.getByText("ชำระเงินแล้ว")).toBeInTheDocument();
    expect(screen.queryByText("เลขอ้างอิงสลิป")).not.toBeInTheDocument();
  });

  it("แสดงเลขอ้างอิงและสถานะตรวจสอบแล้วโดยไม่แสดงเงินสด เมื่อชำระผ่านสลิป", () => {
    saveOrder({ ...sampleOrder, method: "พร้อมเพย์", cash: null, ref: "REF-789", verified: true });
    render(<Receipt />);
    expect(screen.getByText("REF-789")).toBeInTheDocument();
    expect(screen.getByText("ตรวจสอบการชำระเงินแล้ว")).toBeInTheDocument();
    expect(screen.queryByText("รับเงิน")).not.toBeInTheDocument();
    expect(screen.queryByText("เงินทอน")).not.toBeInTheDocument();
  });

  it("โหลดข้อมูลร้านค้าและแสดงที่อยู่ เบอร์โทร และโลโก้ตามการตั้งค่า", async () => {
    saveOrder(sampleOrder);
    mockSettings({
      shop_name: "ร้านทดสอบ",
      shop_address: "123 ถนนตัวอย่าง",
      shop_phone: "0812345678",
      receipt_footer: "ขอบคุณค่ะ",
      receipt_show_address: "1",
      receipt_show_phone: 1,
      receipt_show_logo: true,
      receipt_logo_url: "/uploads/logo.png",
      paper_size: "58mm",
    });
    const { container } = render(<Receipt />);
    expect(await screen.findByRole("heading", { name: "ร้านทดสอบ" })).toBeInTheDocument();
    expect(screen.getByText("123 ถนนตัวอย่าง")).toBeInTheDocument();
    expect(screen.getByText("โทร. 0812345678")).toBeInTheDocument();
    expect(screen.getByText("ขอบคุณค่ะ")).toBeInTheDocument();
    expect(screen.getByAltText("โลโก้ร้านค้า")).toHaveAttribute("src", "/uploads/logo.png");
    expect(container.querySelector(".receipt-screen")).toHaveAttribute("data-paper-size", "58mm");
    expect(fetch).toHaveBeenCalledWith("/api/settings.php", expect.objectContaining({ credentials: "include" }));
  });

  it("ซ่อนที่อยู่ เบอร์โทร และโลโก้เมื่อปิดการแสดงผล", async () => {
    saveOrder(sampleOrder);
    mockSettings({
      shop_name: "ร้านทดสอบ",
      shop_address: "ที่อยู่ลับ",
      shop_phone: "0999999999",
      receipt_show_address: "0",
      receipt_show_phone: false,
      receipt_show_logo: 0,
      receipt_logo_url: "/logo.png",
    });
    render(<Receipt />);
    await screen.findByRole("heading", { name: "ร้านทดสอบ" });
    expect(screen.queryByText("ที่อยู่ลับ")).not.toBeInTheDocument();
    expect(screen.queryByText("โทร. 0999999999")).not.toBeInTheDocument();
    expect(screen.queryByAltText("โลโก้ร้านค้า")).not.toBeInTheDocument();
  });

  it("ยังแสดงใบเสร็จด้วยค่าเริ่มต้นเมื่อ API ส่ง HTTP error", async () => {
    saveOrder(sampleOrder);
    fetch.mockResolvedValue({ ok: false, status: 500 });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Receipt />);
    expect(screen.getByText("น้ำดื่ม")).toBeInTheDocument();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "ร้านขายของชำ" })).toBeInTheDocument();
  });

  it("ยังแสดงใบเสร็จเมื่อ API ส่ง ok:false", async () => {
    saveOrder(sampleOrder);
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: false, message: "เกิดข้อผิดพลาด" }) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Receipt />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.getByText("น้ำดื่ม")).toBeInTheDocument();
  });

  it("เรียก window.print เมื่อกดพิมพ์ใบเสร็จ", () => {
    saveOrder(sampleOrder);
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<Receipt />);
    fireEvent.click(screen.getByRole("button", { name: "พิมพ์ใบเสร็จ" }));
    expect(print).toHaveBeenCalledOnce();
  });
});
