import { Component, type ReactNode } from "react";

interface Props {
  tabName: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`ErrorBoundary [${this.props.tabName}]:`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={fallbackContainer}>
          <div style={fallbackCard}>
            <h2 style={{ margin: "0 0 0.5rem 0", color: "#f88", fontSize: "1.1em" }}>
              Something went wrong in {this.props.tabName}
            </h2>
            <p style={{ color: "#aaa", margin: "0 0 0.5rem 0", fontSize: "0.9em" }}>
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <button onClick={this.handleReset} style={retryBtn}>
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const fallbackContainer: React.CSSProperties = {
  padding: "2rem",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "200px",
};

const fallbackCard: React.CSSProperties = {
  background: "#1a1a1a",
  border: "1px solid #a33",
  borderRadius: "8px",
  padding: "1.5rem",
  maxWidth: "400px",
  textAlign: "center",
};

const retryBtn: React.CSSProperties = {
  padding: "0.5rem 1rem",
  border: "1px solid #555",
  borderRadius: "4px",
  background: "#222",
  color: "#ddd",
  cursor: "pointer",
  fontSize: "0.9em",
};
