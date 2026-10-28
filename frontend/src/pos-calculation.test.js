
import { describe, expect, it } from "vitest";

describe("POS Calculation Tests", () => {
  const calculateTotal = (items) =>
    items.reduce((sum, item) => sum + item.price * item.qty, 0);

  const calculateChange = (cash, total) => cash - total;

  it("คำนวณยอดรวมสินค้าหนึ่งรายการได้ถูกต้อง", () => {
    const items = [{ price: 50, qty: 2 }];
    expect(calculateTotal(items)).toBe(100);
  });

  it("คำนวณยอดรวมสินค้าหลายรายการได้ถูกต้อง", () => {
    const items = [
      { price: 30, qty: 2 },
      { price: 20, qty: 3 },
    ];
    expect(calculateTotal(items)).toBe(120);
  });

  it("คำนวณเงินทอนได้ถูกต้อง", () => {
    expect(calculateChange(500, 350)).toBe(150);
  });

  it("ยอดรวมตะกร้าว่างต้องเท่ากับศูนย์", () => {
    expect(calculateTotal([])).toBe(0);
  });
});
