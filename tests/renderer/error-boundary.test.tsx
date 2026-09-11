import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { ErrorBoundary } from "@renderer/components/ErrorBoundary";

function ThrowingComponent({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error message");
  }
  return <div>Child content</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary tabName="Test">
        <div>Safe content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });

  it("catches errors and shows fallback UI", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary tabName="Projects">
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something went wrong in Projects/)).toBeInTheDocument();
    expect(screen.getByText("Test error message")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("shows tab name in error message", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary tabName="Recordings">
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Recordings/)).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("renders Try Again button", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary tabName="Test">
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Try Again")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("resets error state on Try Again click", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;
    function ConditionalThrower() {
      if (shouldThrow) throw new Error("boom");
      return <div>Recovered</div>;
    }

    const { rerender } = render(
      <ErrorBoundary tabName="Test">
        <ConditionalThrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText("Try Again"));
    rerender(
      <ErrorBoundary tabName="Test">
        <ConditionalThrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Recovered")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("does not show fallback when children are valid", () => {
    render(
      <ErrorBoundary tabName="Dashboard">
        <div>No crash</div>
      </ErrorBoundary>,
    );
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });
});
