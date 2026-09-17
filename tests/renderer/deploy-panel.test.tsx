import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeployPanel } from "@renderer/components/DeployPanel";

const mockZip = vi.fn();
const mockPreview = vi.fn();
const mockRun = vi.fn();
const mockGenerate = vi.fn(async () => ({ outputDir: "/portfolio", projectCount: 2, assetCount: 5, indexHtmlPath: "/portfolio/index.html" }));
const mockSettingsGet = vi.fn(async () => []);
const mockSettingsSet = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  // @ts-expect-error mock
  window.portfolio = {
    deploy: {
      zip: mockZip,
      preview: mockPreview,
      run: mockRun,
      targets: vi.fn(async () => ["zip", "github-pages", "netlify", "vercel"]),
    },
    portfolio: {
      generate: mockGenerate,
    },
    settings: {
      get: mockSettingsGet,
      set: mockSettingsSet,
    },
  };
});

describe("DeployPanel", () => {
  it("renders heading", () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    expect(screen.getByText("Export & Deploy")).toBeInTheDocument();
  });

  it("renders Download ZIP and Preview Locally buttons", () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    expect(screen.getByText("Download ZIP")).toBeInTheDocument();
    expect(screen.getByText("Preview Locally")).toBeInTheDocument();
  });

  it("renders deploy target chips", () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    expect(screen.getByText("ZIP Export")).toBeInTheDocument();
    expect(screen.getByText("GitHub Pages")).toBeInTheDocument();
    expect(screen.getByText("Netlify")).toBeInTheDocument();
    expect(screen.getByText("Vercel")).toBeInTheDocument();
  });

  it("shows deploy button with default target", () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    expect(screen.getByText("Deploy: ZIP Export")).toBeInTheDocument();
  });

  it("calls zip export on Download ZIP click", async () => {
    mockZip.mockResolvedValue({ outputPath: "/portfolio.zip", fileSizeBytes: 1024, fileCount: 5 });
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Download ZIP"));
    await waitFor(() => {
      expect(mockZip).toHaveBeenCalledWith("/portfolio");
    });
    expect(screen.getByText(/ZIP created: 5 files/)).toBeInTheDocument();
  });

  it("calls preview on Preview Locally click", async () => {
    mockPreview.mockResolvedValue({ success: true });
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Preview Locally"));
    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledWith("/portfolio");
    });
    expect(screen.getByText("Refreshed and opened in default browser")).toBeInTheDocument();
  });

  it("regenerates before previewing, in order", async () => {
    mockPreview.mockResolvedValue({ success: true });
    const order: string[] = [];
    mockGenerate.mockImplementationOnce(async () => {
      order.push("generate");
      return { outputDir: "/portfolio", projectCount: 1, assetCount: 1, indexHtmlPath: "/portfolio/index.html" };
    });
    mockPreview.mockImplementationOnce(async () => {
      order.push("preview");
      return { success: true };
    });
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Preview Locally"));
    await waitFor(() => {
      expect(screen.getByText("Refreshed and opened in default browser")).toBeInTheDocument();
    });
    expect(order).toEqual(["generate", "preview"]);
  });

  it("regenerates on Regenerate click", async () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Regenerate"));
    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Portfolio refreshed: 2 projects, 5 assets")).toBeInTheDocument();
    });
  });

  it("shows error on regenerate failure", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("Generate blew up"));
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Regenerate"));
    await waitFor(() => {
      expect(screen.getByText("Generate blew up")).toBeInTheDocument();
    });
  });

  it("shows error on zip failure", async () => {
    mockZip.mockRejectedValue(new Error("ZIP failed"));
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Download ZIP"));
    await waitFor(() => {
      expect(screen.getByText("ZIP failed")).toBeInTheDocument();
    });
  });

  it("shows error on preview failure", async () => {
    mockPreview.mockRejectedValue(new Error("No index.html"));
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Preview Locally"));
    await waitFor(() => {
      expect(screen.getByText("No index.html")).toBeInTheDocument();
    });
  });

  it("switches deploy target on chip click", async () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("GitHub Pages"));
    expect(screen.getByText("Deploy: GitHub Pages")).toBeInTheDocument();
  });

  it("shows site name input for github-pages", async () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("GitHub Pages"));
    expect(screen.getByPlaceholderText("my-portfolio.example.com")).toBeInTheDocument();
  });

  it("shows site name input for netlify", async () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Netlify"));
    expect(screen.getByPlaceholderText("my-portfolio.example.com")).toBeInTheDocument();
  });

  it("shows site name input for vercel", async () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Vercel"));
    expect(screen.getByPlaceholderText("my-portfolio.example.com")).toBeInTheDocument();
  });

  it("does not show site name input for zip target", async () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    expect(screen.queryByPlaceholderText("my-portfolio.example.com")).not.toBeInTheDocument();
  });

  it("calls deploy with selected target", async () => {
    mockRun.mockResolvedValue({ success: true, target: "github-pages", outputPath: "/out", message: "Deployed!" });
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("GitHub Pages"));
    fireEvent.click(screen.getByText("Deploy: GitHub Pages"));
    await waitFor(() => {
      expect(mockRun).toHaveBeenCalledWith({ target: "github-pages", portfolioDir: "/portfolio", siteName: undefined });
    });
    expect(screen.getByText("Deployed!")).toBeInTheDocument();
  });

  it("includes siteName when provided", async () => {
    mockRun.mockResolvedValue({ success: true, target: "netlify", outputPath: "/out", message: "Done" });
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Netlify"));
    fireEvent.change(screen.getByPlaceholderText("my-portfolio.example.com"), { target: { value: "mysite.com" } });
    fireEvent.click(screen.getByText("Deploy: Netlify"));
    await waitFor(() => {
      expect(mockRun).toHaveBeenCalledWith({ target: "netlify", portfolioDir: "/portfolio", siteName: "mysite.com" });
    });
  });

  it("shows deploy error on failure", async () => {
    mockRun.mockRejectedValue(new Error("Deploy failed"));
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Deploy: ZIP Export"));
    await waitFor(() => {
      expect(screen.getByText("Deploy failed")).toBeInTheDocument();
    });
  });

  it("disables buttons while busy", async () => {
    let resolveZip: (v: unknown) => void;
    mockZip.mockImplementation(() => new Promise((r) => { resolveZip = r; }));
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Download ZIP"));
    await waitFor(() => {
      expect(screen.getByText("Download ZIP")).toBeDisabled();
    });
    resolveZip!({ outputPath: "/p.zip", fileSizeBytes: 0, fileCount: 0 });
    await waitFor(() => {
      expect(screen.getByText("Download ZIP")).not.toBeDisabled();
    });
  });

  it("shows repo inputs for github-push target", async () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Push to GitHub"));
    expect(screen.getByPlaceholderText("C:\\Projects\\user\\user.github.io")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("portfolio")).toBeInTheDocument();
    expect(screen.getByText("Deploy: Push to GitHub")).toBeInTheDocument();
  });

  it("requires repo path for github-push", async () => {
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Push to GitHub"));
    fireEvent.click(screen.getByText("Deploy: Push to GitHub"));
    await waitFor(() => {
      expect(screen.getByText(/local path of your GitHub Pages clone/)).toBeInTheDocument();
    });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("calls deploy run with repo path for github-push", async () => {
    mockRun.mockResolvedValue({ success: true, target: "github-push", outputPath: "/repo/portfolio", message: "Pushed abc1234" });
    render(<DeployPanel portfolioDir="/portfolio" />);
    fireEvent.click(screen.getByText("Push to GitHub"));
    fireEvent.change(screen.getByPlaceholderText("C:\\Projects\\user\\user.github.io"), { target: { value: "C:\\sites\\user.github.io" } });
    fireEvent.click(screen.getByText("Deploy: Push to GitHub"));
    await waitFor(() => {
      expect(mockRun).toHaveBeenCalledWith({
        target: "github-push",
        portfolioDir: "/portfolio",
        siteName: undefined,
        repoPath: "C:\\sites\\user.github.io",
        repoSubPath: "portfolio",
      });
    });
    expect(screen.getByText("Pushed abc1234")).toBeInTheDocument();
  });
});
