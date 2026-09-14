import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { CaptureHost } from "./components/CaptureHost";

const params = new URLSearchParams(window.location.search);
const rootElement = document.getElementById("root")!;

if (params.has("capture")) {
  ReactDOM.createRoot(rootElement).render(<CaptureHost />);
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
