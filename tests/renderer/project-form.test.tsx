import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectForm } from "@renderer/components/ProjectForm";

const mockAutofill = vi.fn(async () => ({}));
const mockListWindows = vi.fn(async () => [
  { title: "My App", pid: 11, hwnd: "0x1" },
  { title: "Other Window", pid: 22, hwnd: "0x2" },
]);
const mockTestCapture = vi.fn(async () => ({ ok: true, brightness: 90, message: "Captured OK" }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("portfolio", {
    scanner: { autofill: mockAutofill },
    windows: { list: mockListWindows, testCapture: mockTestCapture },
  });
});

function renderForm() {
  const onSave = vi.fn(async () => {});
  const onCancel = vi.fn();
  render(<ProjectForm project={null} onSave={onSave} onCancel={onCancel} />);
  return { onSave, onCancel };
}

describe("ProjectForm capture section", () => {
  it("defaults to full desktop with no window picker", () => {
    renderForm();
    expect(screen.getByLabelText("Full desktop")).toBeChecked();
    expect(screen.queryByText("Refresh")).not.toBeInTheDocument();
  });

  it("lists live windows and picks a title", async () => {
    renderForm();
    fireEvent.click(screen.getByLabelText("App window"));

    fireEvent.click(screen.getByText("Refresh"));
    await waitFor(() => {
      expect(screen.getByText("My App")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Window", { selector: "select" }), { target: { value: "My App" } });
    expect(screen.getByPlaceholderText("My App — Dashboard")).toHaveValue("My App");
  });

  it("saves the window binding", async () => {
    const { onSave } = renderForm();
    fireEvent.click(screen.getByLabelText("App window"));
    fireEvent.change(screen.getByPlaceholderText("My App — Dashboard"), { target: { value: "My App" } });
    fireEvent.change(screen.getByLabelText("Name", { exact: false }), { target: { value: "Win" } });
    fireEvent.change(screen.getByLabelText("Project Path", { exact: false }), { target: { value: "C:\\win" } });
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave.mock.calls[0][0]).toMatchObject({ captureMode: "window", windowTitle: "My App" });
  });

  it("shows an error when window listing fails", async () => {
    mockListWindows.mockRejectedValueOnce(new Error("nope"));
    renderForm();
    fireEvent.click(screen.getByLabelText("App window"));
    fireEvent.click(screen.getByText("Refresh"));
    await waitFor(() => {
      expect(screen.getByText("Could not list windows")).toBeInTheDocument();
    });
  });

  it("tests the bound window and shows the result", async () => {
    renderForm();
    fireEvent.click(screen.getByLabelText("App window"));
    fireEvent.change(screen.getByPlaceholderText("My App — Dashboard"), { target: { value: "My App" } });
    fireEvent.click(screen.getByText("Test 3s capture"));
    await waitFor(() => {
      expect(mockTestCapture).toHaveBeenCalledWith("My App");
      expect(screen.getByText("Captured OK")).toBeInTheDocument();
    });
  });

  it("shows test failures", async () => {
    mockTestCapture.mockResolvedValueOnce({ ok: false, brightness: 250, message: "looks blank" });
    renderForm();
    fireEvent.click(screen.getByLabelText("App window"));
    fireEvent.change(screen.getByPlaceholderText("My App — Dashboard"), { target: { value: "My App" } });
    fireEvent.click(screen.getByText("Test 3s capture"));
    await waitFor(() => {
      expect(screen.getByText("looks blank")).toBeInTheDocument();
    });
  });
});
