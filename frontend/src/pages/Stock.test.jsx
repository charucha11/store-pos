import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Stock from './Stock';

vi.mock('../components/Sidebar', () => ({ default: () => <nav aria-label="Sidebar mock" /> }));
const products = [
  { id: 1, code: 'A001', name: 'น้ำดื่ม', price: 10, stock: 0 },
  { id: 2, code: 'B002', name: 'ขนมปัง', price: 25, stock: 3 },
  { id: 3, code: 'C003', name: 'นมกล่อง', price: 20, stock: 10 },
];
const history = [{ id: 9, product_id: 2, product_code: 'B002', product_name: 'ขนมปัง', quantity: 5, note: 'รับเข้า', user_id: 1, created_at: '2026-10-28' }];
function reply(data, status = 200) { return { ok: status < 400, status, text: async () => JSON.stringify(data) }; }
function mockApi(role = 'owner', overrides = {}) {
  let current = products.map((p) => ({ ...p }));
  const calls = [];
  const fetchMock = vi.fn(async (url, options = {}) => {
    calls.push({ url, options });
    if (overrides[url]) return overrides[url](options);
    if (url === '/api/me.php') return reply({ ok: true, user: { id: 1, role } });
    if (url === '/api/stock-history.php') return reply({ ok: true, history });
    if (url === '/api/products.php' && options.method === 'POST') {
      const id = Number(options.body.get('id'));
      const product = current.find((p) => p.id === id);
      if (options.body.get('action') === 'set_stock') product.stock = Number(options.body.get('stock'));
      if (options.body.get('action') === 'stock_in') product.stock += Number(options.body.get('quantity'));
      return reply({ ok: true, stock_after: product.stock });
    }
    if (url === '/api/products.php') return reply({ ok: true, products: current });
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}
function productTable() {
  const header = screen.getByRole('columnheader', { name: 'คงเหลือ' });
  return header.closest('table');
}
async function ready() {
  await waitFor(() => {
    expect(within(productTable()).getByText('น้ำดื่ม')).toBeTruthy();
  });
}
function productRow(name) {
  return within(productTable()).getByText(name).closest('tr');
}

describe('Stock page (real component)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('โหลดสินค้า แสดงสถานะหมด ใกล้หมด ปกติ และประวัติของ owner', async () => {
    mockApi(); render(<Stock />); await ready();
    expect(within(productRow('น้ำดื่ม')).getByText('หมด')).toBeTruthy();
    expect(within(productRow('ขนมปัง')).getByText('ใกล้หมด')).toBeTruthy();
    expect(within(productRow('นมกล่อง')).getByText('ปกติ')).toBeTruthy();
    expect(await screen.findByText('2026-10-28')).toBeTruthy();
  });

  it('พนักงานดูสินค้าได้ แต่ไม่เห็นปุ่มปรับสต็อกหรือประวัติ', async () => {
    const { calls } = mockApi('staff'); render(<Stock />); await ready();
    expect(screen.getAllByText('เฉพาะเจ้าของร้าน')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /รับสินค้าเข้า/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /แก้ไข/ })).toBeNull();
    expect(calls.some((c) => c.url === '/api/stock-history.php')).toBe(false);
  });

  it('ค้นหาสินค้าและกรองสถานะสต็อกได้', async () => {
    mockApi(); render(<Stock />); await ready();
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหาสินค้า' }), { target: { value: 'B002' } });
    expect(within(productTable()).getByText('ขนมปัง')).toBeTruthy();
    expect(within(productTable()).queryByText('น้ำดื่ม')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหาสินค้า' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'กรองสถานะสต็อก' }), { target: { value: 'out' } });
    expect(within(productTable()).getByText('น้ำดื่ม')).toBeTruthy();
    expect(within(productTable()).queryByText('ขนมปัง')).toBeNull();
  });

  it('owner ปรับจำนวนสต็อกและส่ง action=set_stock ได้', async () => {
    const { calls } = mockApi(); render(<Stock />); await ready();
    await userEvent.click(within(productRow('ขนมปัง')).getByRole('button', { name: /แก้ไข/ }));
    const dialog = screen.getByRole('dialog', { name: 'ปรับจำนวนสินค้า' });
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '8' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(screen.getByText('ปรับจำนวนสต็อก ขนมปัง เรียบร้อยแล้ว')).toBeTruthy());
    const post = calls.find((c) => c.options.method === 'POST');
    expect(post.options.body.get('action')).toBe('set_stock');
    expect(post.options.body.get('stock')).toBe('8');
  });

  it('ปฏิเสธจำนวนสต็อกเกิน 9999 โดยไม่ส่ง POST', async () => {
    const { calls } = mockApi(); render(<Stock />); await ready();
    await userEvent.click(within(productRow('ขนมปัง')).getByRole('button', { name: /แก้ไข/ }));
    const dialog = screen.getByRole('dialog', { name: 'ปรับจำนวนสินค้า' });
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '10000' } });
    fireEvent.submit(within(dialog).getByRole('button', { name: 'บันทึก' }).closest('form'));
    expect(await screen.findByText('กรุณากรอกจำนวนสต็อก 0–9999 ชิ้น')).toBeTruthy();
    expect(calls.filter((c) => c.options.method === 'POST')).toHaveLength(0);
  });

  it('owner รับสินค้าเข้าสต็อกพร้อมหมายเหตุได้', async () => {
    const { calls } = mockApi(); render(<Stock />); await ready();
    await userEvent.click(within(productRow('ขนมปัง')).getByRole('button', { name: /รับสินค้าเข้า/ }));
    const dialog = screen.getByRole('dialog', { name: /รับสินค้าเข้าสต็อก/ });
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '4' } });
    fireEvent.change(within(dialog).getByPlaceholderText('เช่น รับสินค้าจากผู้จำหน่าย'), { target: { value: 'ล็อตใหม่' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'ยืนยันรับสินค้า' }));
    await waitFor(() => expect(screen.getByText(/รับสินค้า ขนมปัง จำนวน 4 ชิ้นสำเร็จ/)).toBeTruthy());
    const post = calls.find((c) => c.options.method === 'POST');
    expect(post.options.body.get('action')).toBe('stock_in');
    expect(post.options.body.get('quantity')).toBe('4');
    expect(post.options.body.get('note')).toBe('ล็อตใหม่');
  });

  it('ปฏิเสธจำนวนรับเข้าเป็นศูนย์โดยไม่ส่ง POST', async () => {
    const { calls } = mockApi(); render(<Stock />); await ready();
    await userEvent.click(within(productRow('ขนมปัง')).getByRole('button', { name: /รับสินค้าเข้า/ }));
    const dialog = screen.getByRole('dialog', { name: /รับสินค้าเข้าสต็อก/ });
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '0' } });
    fireEvent.submit(within(dialog).getByRole('button', { name: 'ยืนยันรับสินค้า' }).closest('form'));
    expect(await screen.findByText('กรุณากรอกจำนวนรับเข้า 1–9999 ชิ้น')).toBeTruthy();
    expect(calls.filter((c) => c.options.method === 'POST')).toHaveLength(0);
  });

  it('แสดงข้อผิดพลาดเมื่อ API โหลดสินค้าไม่สำเร็จ', async () => {
    mockApi('owner', { '/api/products.php': async () => reply({ ok: false, message: 'โหลดสินค้าไม่สำเร็จ' }, 500) });
    render(<Stock />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'โหลดสินค้าไม่สำเร็จ');
  });
});
