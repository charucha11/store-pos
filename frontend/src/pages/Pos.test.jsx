import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Pos from "./Pos.jsx";

const PRODUCTS = [
  { id: 1, code: "A1", barcode: "8850001", name: "น้ำดื่ม", price: 15, stock: 3, image: "" },
  { id: 2, code: "B2", barcode: "8850002", name: "ขนมปัง", price: 25, stock: 5, image: "" },
  { id: 3, code: "C3", barcode: "8850003", name: "สินค้าหมด", price: 10, stock: 0, image: "" },
];

function jsonResponse(data, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => data };
}

async function mountPos() {
  render(<Pos />);
  await screen.findByText("น้ำดื่ม");
}

function addQuick(name) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("alert", vi.fn());
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    if (url === "/api/products.php") return jsonResponse({ ok: true, products: PRODUCTS });
    if (url === "/api/save-order.php") return jsonResponse({ ok: true, order_id: 42, total: 15, change: 5 });
    throw new Error(`Unexpected request: ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POS — ทดสอบการทำงานจาก Pos.jsx จริง", () => {
  it("โหลดรายการสินค้าจาก API และแสดงยอดเริ่มต้น", async () => {
    await mountPos();
    expect(screen.getByText("น้ำดื่ม")).toBeTruthy();
    expect(document.querySelector("#total")?.textContent).toBe("0.00");
    expect(fetch).toHaveBeenCalledWith("/api/products.php", { credentials: "include" });
  });

  it("เพิ่มสินค้าในตะกร้าและคำนวณยอดรวม", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    expect(document.querySelector("#total")?.textContent).toBe("15.00");
    expect(document.querySelector("#itemCount")?.textContent).toBe("1");
    addQuick("ขนมปัง");
    expect(document.querySelector("#total")?.textContent).toBe("40.00");
  });

  it("เพิ่มจำนวนด้วยปุ่มบวกและลดจำนวนด้วยปุ่มลบ", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มจำนวน" }));
    expect(document.querySelector("#total")?.textContent).toBe("30.00");
    fireEvent.click(screen.getByRole("button", { name: "ลดจำนวน" }));
    expect(document.querySelector("#total")?.textContent).toBe("15.00");
  });

  it("ห้ามเพิ่มสินค้าเกินสต็อก", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    const input = document.querySelector(".quantity-input");
    fireEvent.change(input, { target: { value: "99" } });
    expect(document.querySelector("#total")?.textContent).toBe("15.00");
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("เหลือเพียง 3 ชิ้น"));
  });

  it("ปิดการเพิ่มสินค้าที่หมดสต็อก", async () => {
    await mountPos();
    expect(screen.getByRole("button", { name: /สินค้าหมด.*10\.00/ }).disabled).toBe(true);
  });

  it("ลบสินค้าออกจากตะกร้าเมื่อยืนยัน", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    fireEvent.click(document.querySelector(".delete-btn"));
    expect(confirm).toHaveBeenCalled();
    expect(document.querySelector("#total")?.textContent).toBe("0.00");
  });

  it("ไม่อนุญาตให้ไปหน้าชำระเงินเมื่อไม่มีสินค้า", async () => {
    await mountPos();
    fireEvent.click(screen.getByRole("button", { name: "ชำระเงิน" }));
    expect(alert).toHaveBeenCalledWith("กรุณาเพิ่มสินค้าก่อนชำระเงิน");
  });

  it("สแกนบาร์โค้ดเพื่อเพิ่มสินค้า", async () => {
    await mountPos();
    const input = screen.getByRole("textbox", { name: "สแกนบาร์โค้ดสินค้า" });
    fireEvent.change(input, { target: { value: "8850002" } });
    fireEvent.submit(input.closest("form"));
    expect(document.querySelector("#total")?.textContent).toBe("25.00");
    expect(input.value).toBe("");
  });

  it("ค้นหาสินค้าตามชื่อ", async () => {
    await mountPos();
    fireEvent.change(screen.getByPlaceholderText("ค้นหาสินค้า"), { target: { value: "ขนม" } });
    fireEvent.click(screen.getByRole("button", { name: /ค้นหา/ }));
    expect(document.querySelectorAll("#productList .product")).toHaveLength(1);
    expect(within(document.querySelector("#productList")).getByText("ขนมปัง")).toBeTruthy();
  });

  it("คำนวณเงินทอนจากเงินสด", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    fireEvent.click(screen.getByRole("button", { name: "ชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: /ชำระด้วยเงินสด/ }));
    fireEvent.change(screen.getByLabelText("รับเงิน"), { target: { value: "20" } });
    expect(document.querySelector("#paymentChange")?.textContent).toBe("5.00");
  });

  it("ปฏิเสธเงินสดที่ไม่เพียงพอโดยไม่ส่ง API บันทึกขาย", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    fireEvent.click(screen.getByRole("button", { name: "ชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: /ชำระด้วยเงินสด/ }));
    fireEvent.change(screen.getByLabelText("รับเงิน"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันการชำระเงิน/ }));
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("จำนวนเงินไม่เพียงพอ"));
    expect(fetch).not.toHaveBeenCalledWith("/api/save-order.php", expect.anything());
  });

  it("ส่งรายการขายเงินสดไป API ด้วยจำนวนสินค้าที่ถูกต้อง", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    fireEvent.click(screen.getByRole("button", { name: "ชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: /ชำระด้วยเงินสด/ }));
    fireEvent.change(screen.getByLabelText("รับเงิน"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันการชำระเงิน/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/save-order.php", expect.objectContaining({ method: "POST" })));
    const request = fetch.mock.calls.find(([url]) => url === "/api/save-order.php")[1];
    expect(JSON.parse(request.body)).toEqual({ method: "cash", ref: "", cash: 20, items: [{ id: 1, qty: 1 }] });
  });

  it("แจ้งเตือนเมื่อค้นหาบาร์โค้ดไม่พบ", async () => {
    await mountPos();
    const input = screen.getByRole("textbox", { name: "สแกนบาร์โค้ดสินค้า" });
    fireEvent.change(input, { target: { value: "UNKNOWN" } });
    fireEvent.submit(input.closest("form"));
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("ไม่พบสินค้า"));
  });
});


describe("POS — additional validation and failure paths", () => {
  it("ignores blank barcode without adding a product", async () => {
    await mountPos();
    const input = screen.getByRole("textbox", { name: "สแกนบาร์โค้ดสินค้า" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form"));
    expect(document.querySelector("#total")?.textContent).toBe("0.00");
    expect(alert).not.toHaveBeenCalled();
  });

  it("does not remove an item when confirmation is cancelled", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    confirm.mockReturnValueOnce(false);
    fireEvent.click(document.querySelector(".delete-btn"));
    expect(document.querySelector("#total")?.textContent).toBe("15.00");
  });

  it("prevents adding more than available stock with the plus button", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    const plus = screen.getByRole("button", { name: "เพิ่มจำนวน" });
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(document.querySelector("#itemCount")?.textContent).toBe("3");
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("เหลือเพียง 3 ชิ้น"));
  });

  it("rejects invalid quantity input", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    fireEvent.change(document.querySelector(".quantity-input"), { target: { value: "0" } });
    expect(document.querySelector("#total")?.textContent).toBe("15.00");
  });

  it("shows no matching products and can return to the POS screen", async () => {
    await mountPos();
    fireEvent.change(screen.getByPlaceholderText("ค้นหาสินค้า"), { target: { value: "NOT_FOUND" } });
    fireEvent.click(screen.getByRole("button", { name: /ค้นหา/ }));
    expect(screen.getByText("ไม่พบสินค้าที่ค้นหา")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /กลับหน้าขายสินค้า/ }));
   expect(screen.getByRole("heading", { name: "POS ขายสินค้า" })).toBeTruthy();
  });

  it("rejects cash payment when the amount is empty", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    fireEvent.click(screen.getByRole("button", { name: "ชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: /ชำระด้วยเงินสด/ }));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันการชำระเงิน/ }));
    expect(alert).toHaveBeenCalledWith("กรุณากรอกจำนวนเงินที่รับมา");
    expect(fetch).not.toHaveBeenCalledWith("/api/save-order.php", expect.anything());
  });

  it("reports an API failure during cash payment", async () => {
    fetch.mockImplementation(async (url) => {
      if (url === "/api/products.php") return jsonResponse({ ok: true, products: PRODUCTS });
      if (url === "/api/save-order.php") return jsonResponse({ ok: false, message: "บันทึกไม่สำเร็จ" }, false);
      throw new Error(`Unexpected request: ${url}`);
    });
    await mountPos();
    addQuick("น้ำดื่ม");
    fireEvent.click(screen.getByRole("button", { name: "ชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: /ชำระด้วยเงินสด/ }));
    fireEvent.change(screen.getByLabelText("รับเงิน"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันการชำระเงิน/ }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("บันทึกไม่สำเร็จ"));
    expect(document.querySelector("#cashTotal")?.textContent).toBe("15.00");
  });

  it("requires a slip before checking a QR payment", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    fireEvent.click(screen.getByRole("button", { name: "ชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: /ชำระด้วย QR Code/ }));
    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบการชำระเงิน/ }));
    expect(alert).toHaveBeenCalledWith("กรุณาเลือกไฟล์สลิปก่อนตรวจสอบ");
  });

  it("rejects unsupported slip file types", async () => {
    await mountPos();
    addQuick("น้ำดื่ม");
    fireEvent.click(screen.getByRole("button", { name: "ชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: /ชำระด้วย QR Code/ }));
    const file = new File(["text"], "slip.txt", { type: "text/plain" });
    fireEvent.change(document.querySelector("#slipFile"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบการชำระเงิน/ }));
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("รองรับเฉพาะ"));
  });

  it("shows an error when slip verification is rejected", async () => {
    fetch.mockImplementation(async (url) => {
      if (url === "/api/products.php") return jsonResponse({ ok: true, products: PRODUCTS });
      if (url === "/api/check-slip.php") return jsonResponse({ success: false, message: "สลิปไม่ผ่าน" });
      throw new Error(`Unexpected request: ${url}`);
    });
    await mountPos();
    addQuick("น้ำดื่ม");
    fireEvent.click(screen.getByRole("button", { name: "ชำระเงิน" }));
    fireEvent.click(screen.getByRole("button", { name: /ชำระด้วย QR Code/ }));
    const file = new File(["image"], "slip.png", { type: "image/png" });
    fireEvent.change(document.querySelector("#slipFile"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบการชำระเงิน/ }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("สลิปไม่ผ่าน"));
    expect(screen.getByRole("status").textContent).toBe("สลิปไม่ผ่าน");
    expect(fetch).not.toHaveBeenCalledWith("/api/save-order.php", expect.anything());
  });

  it("shows an error if logout fails", async () => {
    fetch.mockImplementation(async (url) => {
      if (url === "/api/products.php") return jsonResponse({ ok: true, products: PRODUCTS });
      if (url === "/api/logout.php") return jsonResponse({}, false);
      throw new Error(`Unexpected request: ${url}`);
    });
    await mountPos();
    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("ออกจากระบบไม่สำเร็จ"));
  });
});
