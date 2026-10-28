import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

// Mock child pages so these tests measure routing/session logic in App,
// not unrelated API requests or timers inside the individual pages.
vi.mock("./pages/Login", () => ({ default: () => <div>MOCK_LOGIN</div> }));
vi.mock("./pages/Register", () => ({ default: () => <div>MOCK_REGISTER</div> }));
vi.mock("./pages/Pos", () => ({ default: () => <div>MOCK_POS</div> }));
vi.mock("./pages/Receipt", () => ({ default: () => <div>MOCK_RECEIPT</div> }));
vi.mock("./pages/Dashboard", () => ({ default: () => <div>MOCK_DASHBOARD</div> }));
vi.mock("./pages/Product", () => ({ default: () => <div>MOCK_PRODUCT</div> }));
vi.mock("./pages/Stock", () => ({ default: () => <div>MOCK_STOCK</div> }));
vi.mock("./pages/Report", () => ({ default: () => <div>MOCK_REPORT</div> }));
vi.mock("./pages/Users", () => ({ default: () => <div>MOCK_USERS</div> }));
vi.mock("./pages/Profile", () => ({ default: () => <div>MOCK_PROFILE</div> }));

const signedIn = () => ({ ok: true, json: async () => ({ ok: true, user: { id: 1, role: "owner" } }) });
const signedOut = () => ({ ok: true, json: async () => ({ ok: false, user: null }) });

function go(path) {
  window.history.replaceState({}, "", path);
}

beforeEach(() => {
  go("/");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(signedIn()));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App - session and page routing", () => {
  it("shows a loading message while the session request is pending", () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    render(<App />);
    expect(screen.getByText("กำลังตรวจสอบการเข้าสู่ระบบ...")).toBeTruthy();
  });

  it("checks the current session using credentials and an abort signal", async () => {
    render(<App />);
    await screen.findByText("MOCK_POS");
    expect(fetch).toHaveBeenCalledWith("/api/me.php", {
      credentials: "include",
      signal: expect.any(AbortSignal),
    });
  });

  it("allows the register page even while the session check is pending", () => {
    go("/register");
    fetch.mockImplementation(() => new Promise(() => {}));
    render(<App />);
    expect(screen.getByText("MOCK_REGISTER")).toBeTruthy();
  });

  it("renders the login page for a guest session", async () => {
    fetch.mockResolvedValue(signedOut());
    go("/dashboard");
    render(<App />);
    expect(await screen.findByText("MOCK_LOGIN")).toBeTruthy();
  });

  it("renders the login page if the API responds with an HTTP error", async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: true, user: { id: 1 } }) });
    render(<App />);
    expect(await screen.findByText("MOCK_LOGIN")).toBeTruthy();
  });

  it("renders the login page when the session request rejects", async () => {
    fetch.mockRejectedValue(new Error("Network unavailable"));
    render(<App />);
    expect(await screen.findByText("MOCK_LOGIN")).toBeTruthy();
  });

  it("renders the login page when the response is not valid JSON", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("Invalid JSON"); } });
    render(<App />);
    expect(await screen.findByText("MOCK_LOGIN")).toBeTruthy();
  });

  it("does not update the UI after unmount and aborts the request", async () => {
    let resolveRequest;
    fetch.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const { unmount } = render(<App />);
    const signal = fetch.mock.calls[0][1].signal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
    resolveRequest(signedIn());
    await Promise.resolve();
  });

  it.each([
    ["/", "MOCK_POS"],
    ["/pos", "MOCK_POS"],
    ["/receipt", "MOCK_RECEIPT"],
    ["/dashboard", "MOCK_DASHBOARD"],
    ["/product", "MOCK_PRODUCT"],
    ["/stock", "MOCK_STOCK"],
    ["/report", "MOCK_REPORT"],
    ["/users", "MOCK_USERS"],
    ["/profile", "MOCK_PROFILE"],
    ["/unknown", "MOCK_POS"],
  ])("routes an authenticated user at %s to %s", async (path, page) => {
    go(path);
    render(<App />);
    expect(await screen.findByText(page)).toBeTruthy();
  });

  it("does not grant access when the response has no user", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, user: null }) });
    go("/users");
    render(<App />);
    expect(await screen.findByText("MOCK_LOGIN")).toBeTruthy();
  });
});
