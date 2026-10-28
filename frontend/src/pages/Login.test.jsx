import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from './Login';

const usernameField = () => screen.getByRole('textbox', { name: 'ชื่อผู้ใช้งาน' });
const passwordField = () => screen.getByLabelText('รหัสผ่าน');
const submitButton = () => screen.getByRole('button', { name: 'เข้าสู่ระบบ' });

function fillLogin(username = 'owner', password = 'secret123') {
  fireEvent.change(usernameField(), { target: { value: username } });
  fireEvent.change(passwordField(), { target: { value: password } });
}

function submit() {
  fireEvent.submit(submitButton().closest('form'));
}

function mockResponse(body, ok = true) {
  return { ok, text: vi.fn().mockResolvedValue(body) };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Login page', () => {
  it('แสดงหัวข้อ ฟอร์มเข้าสู่ระบบ และลิงก์สมัครบัญชี', () => {
    render(<Login />);
    expect(screen.getByRole('heading', { name: 'ร้านขายของชำ' })).toBeTruthy();
    expect(usernameField()).toBeTruthy();
    expect(passwordField()).toHaveProperty('type', 'password');
    expect(submitButton()).toBeTruthy();
    expect(screen.getByRole('link', { name: 'สมัครบัญชี' }).getAttribute('href')).toBe('/register');
    expect(screen.getByRole('img', { name: 'ร้านขายของชำ' }).getAttribute('src')).toBe('/IMG_5064.png');
  });

  it('สลับการแสดงและซ่อนรหัสผ่านได้', () => {
    render(<Login />);
    fireEvent.click(screen.getByRole('button', { name: 'แสดงรหัสผ่าน' }));
    expect(passwordField()).toHaveProperty('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อนรหัสผ่าน' }));
    expect(passwordField()).toHaveProperty('type', 'password');
  });

  it('ไม่เรียก API หากไม่ได้กรอกชื่อผู้ใช้', () => {
    render(<Login />);
    fireEvent.change(passwordField(), { target: { value: '1234' } });
    submit();
    expect(screen.getByRole('alert').textContent).toContain('กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ไม่เรียก API หากไม่ได้กรอกรหัสผ่าน', () => {
    render(<Login />);
    fireEvent.change(usernameField(), { target: { value: 'owner' } });
    submit();
    expect(screen.getByRole('alert').textContent).toContain('กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ไม่รับชื่อผู้ใช้ที่มีแต่ช่องว่าง', () => {
    render(<Login />);
    fillLogin('   ', '1234');
    submit();
    expect(screen.getByRole('alert').textContent).toContain('กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ส่ง POST พร้อม credentials และตัดช่องว่างรอบชื่อผู้ใช้', async () => {
    fetch.mockResolvedValue(mockResponse(JSON.stringify({ ok: false, message: 'รหัสผ่านไม่ถูกต้อง' })));
    render(<Login />);
    fillLogin('  owner  ', 'pass 123');
    submit();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/login.php');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('username')).toBe('owner');
    expect(options.body.get('password')).toBe('pass 123');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'รหัสผ่านไม่ถูกต้อง');
  });

  it('แสดงสถานะกำลังเข้าสู่ระบบและปิดปุ่มระหว่างรอ API', async () => {
    let finish;
    fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Login />);
    fillLogin();
    submit();
    expect(screen.getByRole('button', { name: 'กำลังเข้าสู่ระบบ...' }).disabled).toBe(true);
    finish(mockResponse(JSON.stringify({ ok: false, message: 'ลองใหม่' })));
    await waitFor(() => expect(submitButton().disabled).toBe(false));
  });

  it('แสดงข้อความเมื่อ PHP ส่งผลลัพธ์ว่าง', async () => {
    fetch.mockResolvedValue(mockResponse('   '));
    render(<Login />);
    fillLogin();
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('เซิร์ฟเวอร์ไม่ส่งข้อมูลกลับมา');
    expect(submitButton().disabled).toBe(false);
  });

  it('แสดงข้อความเมื่อ PHP ส่ง JSON ที่ไม่ถูกต้อง', async () => {
    fetch.mockResolvedValue(mockResponse('<html>PHP Error</html>'));
    render(<Login />);
    fillLogin();
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('ข้อมูลที่ได้รับจากเซิร์ฟเวอร์ไม่ถูกต้อง');
    expect(console.error).toHaveBeenCalled();
  });

  it('แสดงข้อความจาก API เมื่อ HTTP ไม่สำเร็จ', async () => {
    fetch.mockResolvedValue(mockResponse(JSON.stringify({ ok: false, message: 'ไม่มีสิทธิ์ใช้งาน' }), false));
    render(<Login />);
    fillLogin();
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('ไม่มีสิทธิ์ใช้งาน');
  });

  it('แสดงข้อความสำรองเมื่อ API ปฏิเสธโดยไม่มี message', async () => {
    fetch.mockResolvedValue(mockResponse(JSON.stringify({ ok: false })));
    render(<Login />);
    fillLogin();
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('เข้าสู่ระบบไม่สำเร็จ');
  });

  it('แสดงข้อผิดพลาดเมื่อเชื่อมต่อเครือข่ายไม่ได้', async () => {
    fetch.mockRejectedValue(new Error('Network failed'));
    render(<Login />);
    fillLogin();
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('Network failed');
    await waitFor(() => expect(submitButton().disabled).toBe(false));
  });

  it('แสดงข้อความสำรองเมื่อการเชื่อมต่อล้มเหลวโดยไม่มีข้อความ', async () => {
    fetch.mockRejectedValue({});
    render(<Login />);
    fillLogin();
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  });

  it('ล้างข้อความผิดพลาดเดิมเมื่อเริ่มเข้าสู่ระบบใหม่', async () => {
    fetch.mockResolvedValueOnce(mockResponse(JSON.stringify({ ok: false, message: 'ครั้งแรกผิด' })));
    let finish;
    fetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<Login />);
    fillLogin();
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('ครั้งแรกผิด');
    submit();
    expect(screen.queryByRole('alert')).toBeNull();
    finish(mockResponse(JSON.stringify({ ok: false, message: 'ครั้งที่สองผิด' })));
    expect((await screen.findByRole('alert')).textContent).toContain('ครั้งที่สองผิด');
  });

  it('เพิ่มคลาส animation หลัง 50ms และล้าง timer เมื่อ unmount', async () => {
    vi.useFakeTimers();
    try {
      const { container, unmount } = render(<Login />);
      expect(container.querySelector('.login-container').classList.contains('login-show')).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(51);
      });
      expect(container.querySelector('.login-container').classList.contains('login-show')).toBe(true);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
