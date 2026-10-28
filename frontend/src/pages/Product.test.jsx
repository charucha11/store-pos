import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Product from './Product';

const products = [
  { id: 1, code: 'P001', barcode: '111', name: 'น้ำดื่ม', category: 'เครื่องดื่ม', price: 10, stock: 15, image: '' },
  { id: 2, code: 'P002', barcode: '222', name: 'ขนมปัง', category: 'ขนม', price: 25, stock: 4, image: '' },
];
let role = 'owner';
let productList = products;
let getError = null;
let postError = null;
let requests;

function jsonResponse(data, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

beforeEach(() => {
  role = 'owner';
  productList = products.map((p) => ({ ...p }));
  getError = null;
  postError = null;
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    requests.push({ url, options });
    if (url === '/api/me.php') return jsonResponse({ ok: true, user: { role } });
    if (url === '/api/products.php' && options.method === 'POST') {
      if (postError) return jsonResponse({ ok: false, message: postError }, false, 400);
      return jsonResponse({ ok: true });
    }
    if (url === '/api/products.php') {
      if (getError) return jsonResponse({ ok: false, message: getError }, false, 500);
      return jsonResponse({ ok: true, products: productList });
    }
    if (url === '/api/logout.php') return jsonResponse({ ok: true });
    throw new Error(`Unexpected request: ${url}`);
  }));
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function ready() {
  render(<Product />);
  await screen.findByText('น้ำดื่ม');
  await waitFor(() => expect(screen.getByRole('button', { name: '+ เพิ่มสินค้า' })).toBeTruthy());
}

function fillProduct({ code = 'P003', name = 'ชาเขียว', category = 'เครื่องดื่ม', price = '35', stock = '8' } = {}) {
  fireEvent.change(screen.getByPlaceholderText('เช่น P013'), { target: { value: code } });
  fireEvent.change(screen.getByPlaceholderText('กรอกชื่อสินค้า'), { target: { value: name } });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: category } });
  const dialog = screen.getByRole('dialog');
  const numericInputs = dialog.querySelectorAll('input[type="number"]');
  fireEvent.change(numericInputs[0], { target: { value: price } });
  if (!numericInputs[1].disabled) fireEvent.change(numericInputs[1], { target: { value: stock } });
}

describe('Product page', () => {
  it('loads products and formats price and stock', async () => {
    await ready();
    expect(screen.getByText('฿10.00')).toBeTruthy();
    expect(screen.getByText('เหลือ 15 ชิ้น')).toBeTruthy();
    expect(screen.getByText('ขนมปัง')).toBeTruthy();
  });

  it('filters products by name', async () => {
    await ready();
    fireEvent.change(screen.getByRole('textbox', { name: 'ค้นหาสินค้า' }), { target: { value: 'น้ำดื่ม' } });
    expect(screen.getByText('น้ำดื่ม')).toBeTruthy();
    expect(screen.queryByText('ขนมปัง')).toBeNull();
  });

  it('filters by product code or barcode', async () => {
    await ready();
    fireEvent.change(screen.getByRole('textbox', { name: 'ค้นหาสินค้า' }), { target: { value: '222' } });
    expect(screen.getByText('ขนมปัง')).toBeTruthy();
    expect(screen.queryByText('น้ำดื่ม')).toBeNull();
  });

  it('filters by category and can show all', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'ขนม' }));
    expect(screen.getByText('ขนมปัง')).toBeTruthy();
    expect(screen.queryByText('น้ำดื่ม')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ทั้งหมด' }));
    expect(screen.getByText('น้ำดื่ม')).toBeTruthy();
  });

  it('shows empty search results', async () => {
    await ready();
    fireEvent.change(screen.getByRole('textbox', { name: 'ค้นหาสินค้า' }), { target: { value: 'not-found-999' } });
    expect(screen.getByText(/ไม่พบสินค้าที่ค้นหา/)).toBeTruthy();
  });

  it('hides owner actions from staff', async () => {
    role = 'staff';
    render(<Product />);
    await screen.findByText('น้ำดื่ม');
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/me.php', expect.any(Object)));
    expect(screen.queryByRole('button', { name: '+ เพิ่มสินค้า' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'แก้ไข น้ำดื่ม' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ลบ น้ำดื่ม' })).toBeNull();
  });

  it('opens and closes the add product form', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่มสินค้า' }));
    expect(screen.getByRole('dialog', { name: 'เพิ่มสินค้า' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('adds a valid product with multipart FormData', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่มสินค้า' }));
    fillProduct();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกสินค้า' }));
    await waitFor(() => expect(requests.some((r) => r.options.method === 'POST' && r.options.body?.get('action') === 'add')).toBe(true));
    const req = requests.find((r) => r.options.body?.get('action') === 'add');
    expect(req.options.body.get('name')).toBe('ชาเขียว');
    expect(req.options.body.get('stock')).toBe('8');
    await waitFor(() => expect(alert).toHaveBeenCalledWith('เพิ่มสินค้าเรียบร้อยแล้ว'));
  });

  it('opens edit form and does not submit stock changes', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไข น้ำดื่ม' }));
    const dialog = screen.getByRole('dialog', { name: 'แก้ไขสินค้า' });
    expect(within(dialog).getByDisplayValue('น้ำดื่ม')).toBeTruthy();
    expect(dialog.querySelectorAll('input[type="number"]')[1].disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }));
    await waitFor(() => expect(requests.some((r) => r.options.body?.get('action') === 'update')).toBe(true));
    const req = requests.find((r) => r.options.body?.get('action') === 'update');
    expect(req.options.body.get('id')).toBe('1');
    expect(req.options.body.has('stock')).toBe(false);
  });

  it('does not delete when user cancels confirmation', async () => {
    await ready();
    confirm.mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'ลบ น้ำดื่ม' }));
    expect(requests.some((r) => r.options.body?.get('action') === 'delete')).toBe(false);
  });

  it('deletes after confirmation', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'ลบ น้ำดื่ม' }));
    await waitFor(() => expect(requests.some((r) => r.options.body?.get('action') === 'delete')).toBe(true));
    const req = requests.find((r) => r.options.body?.get('action') === 'delete');
    expect(req.options.body.get('id')).toBe('1');
  });

  it('shows server errors and allows retry', async () => {
    getError = 'โหลดสินค้าไม่สำเร็จ';
    render(<Product />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('โหลดสินค้าไม่สำเร็จ'));
    getError = null;
    fireEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByText('น้ำดื่ม')).toBeTruthy();
  });

  it('shows an error when saving fails', async () => {
    postError = 'บันทึกสินค้าไม่สำเร็จ';
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่มสินค้า' }));
    fillProduct();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกสินค้า' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('บันทึกสินค้าไม่สำเร็จ'));
  });

  it('shows a placeholder for products without images', async () => {
    await ready();
    expect(screen.getAllByText('ยังไม่มีรูปสินค้า').length).toBe(2);
  });

  it('rejects a negative price without posting product data', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่มสินค้า' }));
    fillProduct({ price: '-1' });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
    expect(alert).toHaveBeenCalledWith('ราคาและจำนวนสต็อกไม่ถูกต้อง');
    expect(requests.some((r) => r.options.method === 'POST')).toBe(false);
  });

  it('rejects a fractional stock count without posting', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่มสินค้า' }));
    fillProduct({ stock: '1.5' });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
    expect(alert).toHaveBeenCalledWith('ราคาและจำนวนสต็อกไม่ถูกต้อง');
    expect(requests.some((r) => r.options.method === 'POST')).toBe(false);
  });

  it('sends the barcode when adding a product', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่มสินค้า' }));
    fillProduct();
    fireEvent.change(screen.getByPlaceholderText('กรอกบาร์โค้ด'), { target: { value: '8851234567890' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกสินค้า' }));
    await waitFor(() => expect(requests.some((r) => r.options.body?.get('action') === 'add')).toBe(true));
    const req = requests.find((r) => r.options.body?.get('action') === 'add');
    expect(req.options.body.get('barcode')).toBe('8851234567890');
  });

  it('rejects an unsupported image type', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่มสินค้า' }));
    fillProduct();
    const fileInput = screen.getByRole('dialog').querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกสินค้า' }));
    expect(alert).toHaveBeenCalledWith('รูปต้องเป็น JPG, PNG, WEBP หรือ GIF และไม่เกิน 2 MB');
    expect(requests.some((r) => r.options.method === 'POST')).toBe(false);
  });

  it('rejects an image larger than 2 MB', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่มสินค้า' }));
    fillProduct();
    const imageFile = new File(['x'], 'large.png', { type: 'image/png' });
    Object.defineProperty(imageFile, 'size', { value: 2 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByRole('dialog').querySelector('input[type="file"]'), { target: { files: [imageFile] } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกสินค้า' }));
    expect(alert).toHaveBeenCalledWith('รูปต้องเป็น JPG, PNG, WEBP หรือ GIF และไม่เกิน 2 MB');
    expect(requests.some((r) => r.options.method === 'POST')).toBe(false);
  });

  it('includes a valid image in multipart FormData', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่มสินค้า' }));
    fillProduct();
    const imageFile = new File(['image'], 'tea.png', { type: 'image/png' });
    fireEvent.change(screen.getByRole('dialog').querySelector('input[type="file"]'), { target: { files: [imageFile] } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกสินค้า' }));
    await waitFor(() => expect(requests.some((r) => r.options.body?.get('action') === 'add')).toBe(true));
    expect(requests.find((r) => r.options.body?.get('action') === 'add').options.body.get('image').name).toBe('tea.png');
  });

  it('shows an image URL and falls back when loading fails', async () => {
    productList = [{ ...products[0], image: 'https://example.com/missing.png' }];
    await ready();
    const img = screen.getByRole('img', { name: 'น้ำดื่ม' });
    expect(img.getAttribute('src')).toBe('https://example.com/missing.png');
    fireEvent.error(img);
    expect(screen.getByText('ยังไม่มีรูปสินค้า')).toBeTruthy();
  });

  it('converts backend product image paths into URLs', async () => {
    productList = [{ ...products[0], image: 'uploads/products/green tea.png' }];
    await ready();
    expect(screen.getByRole('img', { name: 'น้ำดื่ม' }).getAttribute('src'))
      .toBe('http://127.0.0.1:8000/uploads/products/green%20tea.png');
  });

  it('converts legacy image paths into public URLs', async () => {
    productList = [{ ...products[0], image: 'uploads/old photo.jpg' }];
    await ready();
    expect(screen.getByRole('img', { name: 'น้ำดื่ม' }).getAttribute('src'))
      .toBe('/uploads/old%20photo.jpg');
  });

  it('shows a server error when deleting a product fails', async () => {
    postError = 'ไม่สามารถลบสินค้าได้';
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'ลบ น้ำดื่ม' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('ไม่สามารถลบสินค้าได้'));
  });

  it('shows a fallback HTTP error when the server sends invalid JSON', async () => {
    fetch.mockImplementation(async (url) => {
      if (url === '/api/me.php') return jsonResponse({ ok: true, user: { role: 'owner' } });
      if (url === '/api/products.php') return { ok: false, status: 503, json: async () => { throw new Error('invalid json'); } };
      throw new Error('Unexpected request');
    });
    render(<Product />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('HTTP 503'));
  });

});
