import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Profile from './Profile';

const owner = { id: 1, username: 'owner', full_name: 'เจ้าของร้าน', phone: '0811111111', role: 'owner' };
const staff = { id: 2, username: 'staff', full_name: 'พนักงาน', phone: '', role: 'staff' };
const initialSettings = {
  shop_name: 'ร้านตัวอย่าง', shop_address: 'กรุงเทพฯ', shop_phone: '021234567',
  shop_email: 'shop@example.com', receipt_footer: 'ขอบคุณค่ะ', paper_size: '80mm',
  receipt_show_address: true, receipt_show_phone: true, receipt_show_logo: false,
  receipt_logo_url: '', notify_low_stock: true, notify_sales: true, confirm_delete: true,
};

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) };
}

function setupApi({ currentUser = owner, settings = initialSettings, activity = [], fail = {} } = {}) {
  const requests = [];
  const fetchMock = vi.fn(async (url, options = {}) => {
    const path = String(url).split('/').pop();
    const method = options.method || 'GET';
    requests.push({ path, method, options });
    if (fail[path]) return jsonResponse({ ok: false, message: fail[path] }, 500);
    if (path === 'profile.php') {
      if (method === 'POST') return jsonResponse({ ok: true, user: { ...currentUser, ...JSON.parse(options.body) } });
      return jsonResponse({ ok: true, user: currentUser });
    }
    if (path === 'settings.php') {
      if (method === 'POST') return jsonResponse({ ok: true, settings: JSON.parse(options.body) });
      return jsonResponse({ ok: true, settings });
    }
    if (path === 'activity.php') return jsonResponse({ ok: true, events: activity });
    if (path === 'logout.php') return jsonResponse({ ok: true });
    throw new Error(`Unexpected API request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, requests };
}

async function openProfile(options) {
  const api = setupApi(options);
  render(<Profile />);
  await screen.findByDisplayValue(options?.settings?.shop_name || initialSettings.shop_name);
  return api;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-grocery-theme');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Profile page (real component)', () => {
  it('โหลดโปรไฟล์ ร้านค้า และประวัติกิจกรรมจาก API', async () => {
    const { requests } = await openProfile({ activity: [{ username: 'owner', description: 'แก้ไขข้อมูลร้าน', created_at: '2026-10-28' }] });
    expect(screen.getByDisplayValue('ร้านตัวอย่าง')).toBeTruthy();
    expect(screen.getByDisplayValue('กรุงเทพฯ')).toBeTruthy();
    expect(requests.map((r) => r.path)).toEqual(expect.arrayContaining(['profile.php', 'settings.php', 'activity.php']));
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    expect(screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent.includes('แก้ไขข้อมูลร้าน'))).toBeTruthy();
  });

  it('เจ้าของร้านแก้ไขและบันทึกข้อมูลร้านได้', async () => {
    const { requests } = await openProfile();
    fireEvent.change(screen.getByLabelText('ชื่อร้าน'), { target: { value: 'ร้านใหม่' } });
    fireEvent.click(screen.getByRole('button', { name: '💾 บันทึกข้อมูล' }));
    await screen.findByText('บันทึกการตั้งค่าเรียบร้อยแล้ว');
    const post = requests.find((r) => r.path === 'settings.php' && r.method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse(post.options.body).shop_name).toBe('ร้านใหม่');
  });

  it('ยกเลิกการแก้ไขแล้วคืนข้อมูลร้านเดิม', async () => {
    await openProfile();
    fireEvent.change(screen.getByLabelText('ชื่อร้าน'), { target: { value: 'ชื่อชั่วคราว' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกการแก้ไข' }));
    expect(screen.getByDisplayValue('ร้านตัวอย่าง')).toBeTruthy();
  });

  it('พนักงานดูข้อมูลได้แต่แก้ไขการตั้งค่าร้านไม่ได้', async () => {
    const { requests } = await openProfile({ currentUser: staff });
    expect(screen.getByLabelText('ชื่อร้าน').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '💾 บันทึกข้อมูล' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    expect(screen.getByRole('checkbox', { name: 'แจ้งเตือนสินค้าใกล้หมด' }).disabled).toBe(true);
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('เจ้าของร้านเปิดปิดการแจ้งเตือนและบันทึกได้', async () => {
    const { requests } = await openProfile();
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    const checkbox = screen.getByRole('checkbox', { name: 'แจ้งเตือนสินค้าใกล้หมด' });
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '💾 บันทึกการตั้งค่า' }));
    await waitFor(() => {
      const post = requests.find((r) => r.path === 'settings.php' && r.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse(post.options.body).notify_low_stock).toBe(false);
    });
  });

  it('เปลี่ยนธีมและรูปแบบการแสดงผลโดยบันทึกลง localStorage', async () => {
    await openProfile();
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'โหมดมืด' }));
    expect(localStorage.getItem('grocery-theme')).toBe('dark');
    expect(document.documentElement.dataset.groceryTheme).toBe('dark');
    fireEvent.change(screen.getByRole('combobox', { name: 'รูปแบบการแสดงผล' }), { target: { value: 'compact' } });
    expect(localStorage.getItem('grocery-density')).toBe('compact');
    fireEvent.click(screen.getByRole('button', { name: '↩ คืนค่าเริ่มต้น' }));
    expect(localStorage.getItem('grocery-theme')).toBe('light');
    expect(localStorage.getItem('grocery-density')).toBe('normal');
  });

  it('แก้ไขข้อมูลส่วนตัวและส่งข้อมูลไป profile.php', async () => {
    const { requests } = await openProfile();
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    fireEvent.click(screen.getByRole('button', { name: '✎ แก้ไขชื่อ / เบอร์โทร' }));
    const form = screen.getByRole('button', { name: 'บันทึกข้อมูลส่วนตัว' }).closest('form');
    fireEvent.change(within(form).getByDisplayValue('เจ้าของร้าน'), { target: { value: 'เจ้าของร้านคนใหม่' } });
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึกข้อมูลส่วนตัว' }));
    await screen.findByText('บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว');
    const post = requests.find((r) => r.path === 'profile.php' && r.method === 'POST');
    expect(JSON.parse(post.options.body).full_name).toBe('เจ้าของร้านคนใหม่');
  });

  it('ยกเลิกหน้าต่างยืนยันออกจากระบบแล้วไม่ส่งคำขอ logout', async () => {
    const { requests } = await openProfile();
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    fireEvent.click(screen.getByRole('button', { name: 'ออกจากระบบ' }));
    expect(screen.getByText('ยืนยันออกจากระบบ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByText('ยืนยันออกจากระบบ')).toBeNull();
    expect(requests.some((r) => r.path === 'logout.php')).toBe(false);
  });

  it('แสดงข้อผิดพลาดเมื่อโหลดข้อมูลร้านไม่สำเร็จ', async () => {
    setupApi({ fail: { 'settings.php': 'ไม่สามารถโหลดการตั้งค่า' } });
    render(<Profile />);
    expect(await screen.findByText('ไม่สามารถโหลดการตั้งค่า')).toBeTruthy();
  });

  it('แสดงข้อผิดพลาดเมื่อบันทึกการตั้งค่าไม่สำเร็จ', async () => {
    const { fetchMock } = await openProfile();
    fetchMock.mockImplementationOnce(async () => jsonResponse({ ok: false, message: 'บันทึกไม่สำเร็จ' }, 500));
    fireEvent.click(screen.getByRole('button', { name: '💾 บันทึกข้อมูล' }));
    expect(await screen.findByText('บันทึกไม่สำเร็จ')).toBeTruthy();
  });

  it('รีเฟรชแล้วโหลดข้อมูลใหม่', async () => {
    const { requests } = await openProfile();
    fireEvent.click(screen.getByRole('button', { name: /รีเฟรช/ }));
    await waitFor(() => expect(requests.filter((r) => r.path === 'profile.php').length).toBe(2));
  });
});

describe('Profile — extra coverage for permissions and failures', () => {
  it('allows owner to edit receipt fields and reset unsaved changes', async () => {
    await openProfile();
    fireEvent.change(screen.getByLabelText('ข้อความท้ายใบเสร็จ'), { target: { value: 'กลับมาอีกนะ' } });
    fireEvent.change(screen.getByLabelText('ขนาดกระดาษ'), { target: { value: 'A4' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'แสดงโลโก้ร้าน' }));
    expect(screen.getByDisplayValue('กลับมาอีกนะ')).toBeTruthy();
    expect(screen.getByDisplayValue('A4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกการแก้ไข' }));
    expect(screen.getByDisplayValue('ขอบคุณค่ะ')).toBeTruthy();
    expect(screen.getByLabelText('ขนาดกระดาษ').value).toBe('80mm');
    expect(screen.getByRole('checkbox', { name: 'แสดงโลโก้ร้าน' }).checked).toBe(false);
  });

  it('does not allow staff to change receipt settings', async () => {
    await openProfile({ currentUser: staff });
    expect(screen.getByLabelText('ข้อความท้ายใบเสร็จ').disabled).toBe(true);
    expect(screen.getByLabelText('ขนาดกระดาษ').disabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'แสดงโลโก้ร้าน' }).disabled).toBe(true);
  });

  it('lets owner reset notification switches before saving', async () => {
    const { requests } = await openProfile({ settings: { ...initialSettings, notify_sales: false, confirm_delete: false } });
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    expect(screen.getByRole('checkbox', { name: 'แจ้งเตือนยอดขาย' }).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /คืนค่าเริ่มต้น/ }));
    expect(screen.getByRole('checkbox', { name: 'แจ้งเตือนยอดขาย' }).checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'ยืนยันก่อนลบข้อมูล' }).checked).toBe(true);
    expect(requests.some(r => r.method === 'POST')).toBe(false);
    expect(screen.getByText(/กดบันทึกการตั้งค่าเพื่อยืนยัน/)).toBeTruthy();
  });

  it('lets staff reset only local display preferences', async () => {
    await openProfile({ currentUser: staff });
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'โหมดมืด' }));
    fireEvent.click(screen.getByRole('button', { name: /คืนค่าเริ่มต้น/ }));
    expect(screen.getByText('คืนค่าการแสดงผลเฉพาะบัญชีนี้แล้ว')).toBeTruthy();
    expect(localStorage.getItem('grocery-theme')).toBe('light');
  });

  it('cancels editing personal details without posting', async () => {
    const { requests } = await openProfile();
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    fireEvent.click(screen.getByRole('button', { name: /แก้ไขชื่อ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.getByRole('button', { name: /แก้ไขชื่อ/ })).toBeTruthy();
    expect(requests.some(r => r.method === 'POST')).toBe(false);
  });

  it('reports profile update failure without showing success', async () => {
    const { fetchMock } = await openProfile();
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    fireEvent.click(screen.getByRole('button', { name: /แก้ไขชื่อ/ }));
    fetchMock.mockImplementationOnce(async () => jsonResponse({ ok: false, message: 'แก้ไขโปรไฟล์ไม่สำเร็จ' }, 500));
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูลส่วนตัว' }));
    expect(await screen.findByText('แก้ไขโปรไฟล์ไม่สำเร็จ')).toBeTruthy();
    expect(screen.queryByText('บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว')).toBeNull();
  });

  it('continues loading when activity endpoint fails', async () => {
    await openProfile({ fail: { 'activity.php': 'ไม่มีประวัติ' } });
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    expect(screen.getByText(/ยังไม่มีประวัติที่บันทึกไว้/)).toBeTruthy();
  });

  it('reports invalid JSON from the settings endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (String(url).endsWith('settings.php')) return { ok: true, text: async () => '<html>error</html>' };
      return jsonResponse({ ok: true, user: owner });
    }));
    render(<Profile />);
    expect(await screen.findByText(/เซิร์ฟเวอร์ไม่ได้ส่ง JSON/)).toBeTruthy();
  });

  it('reports a failed backup download', async () => {
    const { fetchMock } = await openProfile();
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ message: 'สำรองข้อมูลไม่สำเร็จ' }) }));
    fireEvent.click(screen.getByRole('button', { name: /ดาวน์โหลดไฟล์สำรองข้อมูล SQL/ }));
    expect(await screen.findByText('สำรองข้อมูลไม่สำเร็จ')).toBeTruthy();
  });

  it('reports logout API failure and closes confirmation dialog', async () => {
    const { fetchMock } = await openProfile();
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าระบบ' }));
    fireEvent.click(screen.getByRole('button', { name: 'ออกจากระบบ' }));
    fetchMock.mockImplementationOnce(async () => jsonResponse({ ok: false, message: 'ออกจากระบบไม่ได้' }, 500));
    const dialog = screen.getByText('ยืนยันออกจากระบบ').closest('.pv-modal');
    fireEvent.click(within(dialog).getByRole('button', { name: 'ออกจากระบบ' }));
    expect(await screen.findByText('ออกจากระบบไม่ได้')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('ยืนยันออกจากระบบ')).toBeNull());
  });
});
