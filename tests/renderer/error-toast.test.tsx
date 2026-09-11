import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ErrorToastContainer, showToast, clearAllToasts } from "@renderer/components/ErrorToast";

beforeEach(() => {
  vi.useFakeTimers();
  clearAllToasts();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ErrorToastContainer", () => {
  it("renders nothing when no toasts", () => {
    const { container } = render(<ErrorToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it("shows toast after showToast call", () => {
    render(<ErrorToastContainer />);
    act(() => {
      showToast("Something failed");
    });
    expect(screen.getByText("Something failed")).toBeInTheDocument();
  });

  it("shows error type toast with correct styling", () => {
    render(<ErrorToastContainer />);
    act(() => {
      showToast("Error msg", "error");
    });
    expect(screen.getByText("Error msg")).toBeInTheDocument();
  });

  it("shows warning type toast", () => {
    render(<ErrorToastContainer />);
    act(() => {
      showToast("Warning msg", "warning");
    });
    expect(screen.getByText("Warning msg")).toBeInTheDocument();
  });

  it("dismisses toast on × click", () => {
    render(<ErrorToastContainer />);
    act(() => {
      showToast("Dismissible");
    });
    expect(screen.getByText("Dismissible")).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByText("×"));
    });
    expect(screen.queryByText("Dismissible")).not.toBeInTheDocument();
  });

  it("auto-dismisses after 5 seconds", () => {
    render(<ErrorToastContainer />);
    act(() => {
      showToast("Auto dismiss");
    });
    expect(screen.getByText("Auto dismiss")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Auto dismiss")).not.toBeInTheDocument();
  });

  it("shows multiple toasts", () => {
    render(<ErrorToastContainer />);
    act(() => {
      showToast("First");
      showToast("Second");
    });
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
