import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Users from './Users';

const members = [
  { id: 1, username: 'owner1', full_name: 'เจ้าของร้านหนึ่ง', role: 'owner', phone: '0812345678' },
  { id: 2, username: 'staff1', full_name: 'พนักงานหนึ่ง', role: 'staff', phone: '0898765432' },
];
function reply(data, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(data) };
}
function mockApi(role = 'owner', overrides = {}) {
  let current = [...members];
  const calls = [];
  const fetchMock = vi.fn(async (url, options = {}) => {
    calls.push({ url, options });
    if (overrides[url]) return overrides[url](options);
    if (url === '/api/me.php') return reply({ ok: true, user: { id: 1, role } });
    if (url === '/api/users.php' && options.method === 'POST') {
      if (options.body.get('action') === 'add') current.push({ id: 3, username: options.body.get('username'), full_name: options.body.get('full_name'), phone: options.body.get('phone'), role: options.body.get('role') });
      if (options.body.get('action') === 'delete') current = current.filter((u) => String(u.id) !== options.body.get('id'));
      return reply({ ok: true });
    }
    if (url === '/api/users.php') return reply({ ok: true, users: current });
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}
async function ready() {
  await screen.findByText('staff1');
}

describe('Users page (real component)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('โหลดรายชื่อผู้ใช้และแสดงจำนวนแยกตามบทบาท', async () => {
    mockApi(); render(<Users />); await ready();
    expect(screen.getByText('owner1')).toBeTruthy();
    expect(screen.getByText('081-234-5678')).toBeTruthy();
    const summary = screen.getByRole('region', { name: 'สรุปผู้ใช้งาน' });
    expect(within(summary).getByText('2')).toBeTruthy();
    expect(within(summary).getAllByText('1')).toHaveLength(2);
  });

  it('พนักงานดูรายชื่อได้ แต่ไม่เห็นปุ่มเพิ่มและลบ', async () => {
    const { calls } = mockApi('staff'); render(<Users />); await ready();
    expect(screen.queryByRole('button', { name: /เพิ่มผู้ใช้งาน/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /🗑/ })).toBeNull();
    expect(calls.filter((x) => x.options.method === 'POST')).toHaveLength(0);
  });

  it('ค้นหาผู้ใช้งานตามชื่อได้', async () => {
    mockApi(); render(<Users />); await ready();
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหาผู้ใช้งาน' }), { target: { value: 'staff1' } });
    expect(screen.getByText('staff1')).toBeTruthy();
    expect(screen.queryByText('owner1')).toBeNull();
  });

  it('เจ้าของร้านไม่สามารถลบ owner ได้', async () => {
    const { calls } = mockApi(); render(<Users />); await ready();
    const row = screen.getByText('owner1').closest('tr');
    await userEvent.click(within(row).getByRole('button', { name: '🗑' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('ไม่สามารถลบเจ้าของร้านได้')).toBeTruthy();
    expect(calls.filter((x) => x.options.method === 'POST')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'เข้าใจแล้ว' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('การลบพนักงานต้องมีรหัสผ่านเจ้าของร้าน', async () => {
    const { calls } = mockApi(); render(<Users />); await ready();
    const row = screen.getByText('staff1').closest('tr');
    await userEvent.click(within(row).getByRole('button', { name: '🗑' }));
    expect(screen.getByRole('dialog', { name: 'ยืนยันการลบพนักงาน' })).toBeTruthy();
    expect(calls.filter((x) => x.options.method === 'POST')).toHaveLength(0);
    fireEvent.change(screen.getByPlaceholderText('รหัสผ่านเจ้าของร้าน'), { target: { value: 'secret123' } });
    await userEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(screen.getByText('ลบผู้ใช้งานเรียบร้อยแล้ว')).toBeTruthy());
    const post = calls.find((x) => x.options.method === 'POST');
    expect(post.options.body.get('action')).toBe('delete');
    expect(post.options.body.get('id')).toBe('2');
    expect(post.options.body.get('confirm_password')).toBe('secret123');
    expect(screen.queryByText('staff1')).toBeNull();
  });

  it('เจ้าของร้านเพิ่มพนักงานด้วยข้อมูลถูกต้องได้', async () => {
    const { calls } = mockApi(); render(<Users />); await ready();
    await userEvent.click(screen.getByRole('button', { name: /เพิ่มผู้ใช้งาน/ }));
    fireEvent.change(screen.getByPlaceholderText('ภาษาอังกฤษหรือตัวเลข 3–50 ตัว'), { target: { value: 'newstaff' } });
    fireEvent.change(screen.getByPlaceholderText('กรอกเบอร์โทรศัพท์'), { target: { value: '0811111111' } });
    fireEvent.change(screen.getByPlaceholderText('อย่างน้อย 6 ตัวอักษร'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByPlaceholderText('ยืนยันรหัสผ่าน'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อ-นามสกุล'), { target: { value: 'พนักงานใหม่' } });
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกผู้ใช้งาน' }));
    await waitFor(() => expect(screen.getByText('เพิ่มผู้ใช้งานเรียบร้อยแล้ว')).toBeTruthy());
    const post = calls.find((x) => x.options.method === 'POST');
    expect(post.options.body.get('action')).toBe('add');
    expect(post.options.body.get('role')).toBe('staff');
    expect(post.options.body.get('username')).toBe('newstaff');
  });

  it('แสดงข้อผิดพลาดเมื่อ API โหลดข้อมูลไม่สำเร็จ', async () => {
    mockApi('owner', { '/api/me.php': async () => reply({ ok: false, message: 'เซิร์ฟเวอร์ขัดข้อง' }, 500) });
    render(<Users />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'เซิร์ฟเวอร์ขัดข้อง');
  });
});
