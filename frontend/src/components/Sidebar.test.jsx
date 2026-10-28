import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sidebar from './Sidebar';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/pos');
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Sidebar', () => {
  it('renders all navigation links and highlights current route', () => {
    render(<Sidebar />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(7);
    expect(screen.getByRole('link', { name: 'POS ขายสินค้า' })).toHaveAttribute('href', '/pos');
    expect(screen.getByRole('link', { name: 'POS ขายสินค้า' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'จัดการผู้ใช้งาน' })).toHaveAttribute('href', '/users');
  });

  it('highlights POS for the root path', () => {
    window.history.replaceState({}, '', '/');
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: 'POS ขายสินค้า' })).toHaveClass('active');
  });

  it('posts to logout and disables the button while waiting', async () => {
    let resolveRequest;
    globalThis.fetch.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    render(<Sidebar />);
    const button = screen.getByRole('button', { name: 'ออกจากระบบ' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('กำลังออกจากระบบ...');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/logout.php', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    fireEvent.click(button);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    resolveRequest({ ok: false, status: 401, text: async () => JSON.stringify({ ok: false, message: 'เซสชันหมดอายุ' }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('เซสชันหมดอายุ');
    expect(button).not.toBeDisabled();
  });

  it('reports invalid JSON from the server', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => '<html>error</html>' });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'ออกจากระบบ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('เซิร์ฟเวอร์ไม่ได้ส่ง JSON');
  });

  it('reports network failures and restores the logout button', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network unavailable'));
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'ออกจากระบบ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    await waitFor(() => expect(screen.getByRole('button', { name: 'ออกจากระบบ' })).not.toBeDisabled());
  });
});
