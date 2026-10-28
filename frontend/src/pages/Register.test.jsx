import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Register from "./Register";

const successResponse = (data = { ok: true }) => ({
  ok: true,
  text: vi.fn().mockResolvedValue(JSON.stringify(data)),
});
const failedResponse = (data = { ok: false, message: "ชื่อผู้ใช้ซ้ำ" }) => ({
  ok: false,
  text: vi.fn().mockResolvedValue(JSON.stringify(data)),
});

function fillBase({ password = "abcdef1234", phone = "0812345678" } = {}) {
  fireEvent.change(screen.getByLabelText("ชื่อ-นามสกุล"), { target: { value: "สมชาย ทดสอบ" } });
  fireEvent.change(screen.getByLabelText("ชื่อผู้ใช้"), { target: { value: "somchai" } });
  fireEvent.change(screen.getByLabelText("เบอร์โทรศัพท์"), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText("รหัสผ่าน"), { target: { value: password } });
}
function submit() {
  fireEvent.submit(document.querySelector(".register-form"));
}
function selectStaff() {
  fireEvent.click(screen.getByRole("radio", { name: "พนักงาน" }));
}
function selectOwner() {
  fireEvent.click(screen.getByRole("radio", { name: "เจ้าของร้าน" }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Register page", () => {
  it("แสดงฟอร์มสมัครสมาชิกและลิงก์เข้าสู่ระบบ", () => {
    render(<Register />);
    expect(screen.getByRole("heading", { name: "สมัครสมาชิก" })).toBeTruthy();
    expect(screen.getByLabelText("ชื่อ-นามสกุล")).toBeTruthy();
    expect(screen.getByLabelText("ชื่อผู้ใช้")).toBeTruthy();
    expect(screen.getByLabelText("เบอร์โทรศัพท์")).toBeTruthy();
    expect(screen.getByLabelText("รหัสผ่าน")).toBeTruthy();
    expect(screen.getByRole("link", { name: "เข้าสู่ระบบ" }).getAttribute("href")).toBe("/login");
  });

  it("แสดงระดับความแข็งแรงของรหัสผ่านตามความยาว", () => {
    render(<Register />);
    const password = screen.getByLabelText("รหัสผ่าน");
    expect(screen.getByText("ความปลอดภัยของรหัสผ่าน")).toBeTruthy();
    fireEvent.change(password, { target: { value: "abc" } });
    expect(screen.getByText("รหัสผ่านอ่อน")).toBeTruthy();
    expect(document.querySelector(".register-strength-fill").style.width).toBe("30%");
    fireEvent.change(password, { target: { value: "abcdef" } });
    expect(screen.getByText("รหัสผ่านปานกลาง")).toBeTruthy();
    fireEvent.change(password, { target: { value: "abcdefghij" } });
    expect(screen.getByText("รหัสผ่านแข็งแรง")).toBeTruthy();
    expect(document.querySelector(".register-strength-fill").style.width).toBe("100%");
  });

  it("แสดงและซ่อนรหัสผ่านได้", () => {
    render(<Register />);
    const password = screen.getByLabelText("รหัสผ่าน");
    expect(password.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "แสดงรหัสผ่าน" }));
    expect(password.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "ซ่อนรหัสผ่าน" }));
    expect(password.type).toBe("password");
  });

  it("เลือกเจ้าของร้านแล้วแสดงรหัสยืนยันและปุ่มแสดงรหัส", () => {
    render(<Register />);
    selectOwner();
    const ownerCode = screen.getByLabelText("รหัสยืนยันเจ้าของร้าน");
    expect(ownerCode.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "แสดงรหัส" }));
    expect(ownerCode.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "ซ่อนรหัส" }));
    expect(ownerCode.type).toBe("password");
  });

  it("เปลี่ยนจากเจ้าของร้านเป็นพนักงานแล้วล้างรหัสยืนยัน", () => {
    render(<Register />);
    selectOwner();
    fireEvent.change(screen.getByLabelText("รหัสยืนยันเจ้าของร้าน"), { target: { value: "secret" } });
    selectStaff();
    expect(screen.queryByLabelText("รหัสยืนยันเจ้าของร้าน")).toBeNull();
    selectOwner();
    expect(screen.getByLabelText("รหัสยืนยันเจ้าของร้าน").value).toBe("");
  });

  it("แจ้งเตือนเมื่อไม่มีชื่อหรือชื่อผู้ใช้", () => {
    render(<Register />);
    submit();
    expect(screen.getByRole("alert").textContent).toContain("กรุณากรอกชื่อ-นามสกุลและชื่อผู้ใช้");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("แจ้งเตือนเมื่อเบอร์โทรศัพท์ไม่ครบ 10 หลัก", () => {
    render(<Register />);
    fillBase({ phone: "12345" });
    selectStaff();
    submit();
    expect(screen.getByRole("alert").textContent).toContain("กรุณากรอกเบอร์โทรศัพท์ 10 หลัก");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("แจ้งเตือนเมื่อรหัสผ่านสั้นกว่า 6 ตัวอักษร", () => {
    render(<Register />);
    fillBase({ password: "12345" });
    selectStaff();
    submit();
    expect(screen.getByRole("alert").textContent).toContain("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("แจ้งเตือนเมื่อไม่ได้เลือกประเภทผู้ใช้", () => {
    render(<Register />);
    fillBase();
    submit();
    expect(screen.getByRole("alert").textContent).toContain("กรุณาเลือกประเภทผู้ใช้");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("แจ้งเตือนเจ้าของร้านเมื่อไม่กรอกรหัสยืนยัน", () => {
    render(<Register />);
    fillBase();
    selectOwner();
    submit();
    expect(screen.getByRole("alert").textContent).toContain("กรุณากรอกรหัสยืนยันเจ้าของร้าน");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("พนักงานสมัครสำเร็จ ส่ง FormData ไป API และแสดงหน้าต่างสำเร็จ", async () => {
    fetch.mockResolvedValue(successResponse());
    render(<Register />);
    fillBase();
    selectStaff();
    submit();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/register.php");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("full_name")).toBe("สมชาย ทดสอบ");
    expect(options.body.get("username")).toBe("somchai");
    expect(options.body.get("phone")).toBe("0812345678");
    expect(options.body.get("password")).toBe("abcdef1234");
    expect(options.body.get("role")).toBe("staff");
    expect(options.body.get("owner_password")).toBe("");
    const modal = within(screen.getByRole("dialog"));
    expect(modal.getByText("สมัครสมาชิกสำเร็จ")).toBeTruthy();
    expect(modal.getByText("พนักงาน")).toBeTruthy();
  });

  it("เจ้าของร้านสมัครสำเร็จพร้อมรหัสยืนยัน", async () => {
    fetch.mockResolvedValue(successResponse());
    render(<Register />);
    fillBase();
    selectOwner();
    fireEvent.change(screen.getByLabelText("รหัสยืนยันเจ้าของร้าน"), { target: { value: "owner-secret" } });
    submit();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(fetch.mock.calls[0][1].body.get("owner_password")).toBe("owner-secret");
    expect(within(screen.getByRole("dialog")).getByText("เจ้าของร้าน")).toBeTruthy();
  });

  it("แสดงข้อความผิดพลาดที่ PHP ส่งกลับ", async () => {
    fetch.mockResolvedValue(failedResponse());
    render(<Register />);
    fillBase();
    selectStaff();
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("ชื่อผู้ใช้ซ้ำ"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("แสดงข้อความผิดพลาดเริ่มต้นเมื่อ API ไม่สำเร็จและไม่มี message", async () => {
    fetch.mockResolvedValue(failedResponse({ ok: false }));
    render(<Register />);
    fillBase();
    selectStaff();
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("สมัครสมาชิกไม่สำเร็จ"));
  });

  it("แสดงข้อผิดพลาดเมื่อเซิร์ฟเวอร์ส่งข้อมูลที่ไม่ใช่ JSON", async () => {
    fetch.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue("<html>error</html>") });
    render(<Register />);
    fillBase();
    selectStaff();
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON"));
  });

  it("แสดงข้อผิดพลาดเมื่อเชื่อมต่อ API ไม่ได้", async () => {
    fetch.mockRejectedValue(new Error("Network offline"));
    render(<Register />);
    fillBase();
    selectStaff();
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Network offline"));
  });

  it("ปิดปุ่มสมัครสมาชิกระหว่างรอ API และเปิดอีกครั้งหลังเกิดข้อผิดพลาด", async () => {
    let rejectRequest;
    fetch.mockImplementation(() => new Promise((_, reject) => { rejectRequest = reject; }));
    render(<Register />);
    fillBase();
    selectStaff();
    submit();
    const button = screen.getByRole("button", { name: "กำลังสมัครสมาชิก..." });
    expect(button.disabled).toBe(true);
    rejectRequest(new Error("Try again"));
    await waitFor(() => expect(screen.getByRole("button", { name: "สมัครสมาชิก" }).disabled).toBe(false));
  });
});
