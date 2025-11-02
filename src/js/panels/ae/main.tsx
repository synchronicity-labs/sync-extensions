import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./host-detection";
import "../../shared/styles/main.scss";
import { initBolt } from "../../lib/utils/bolt";

// Initialize Bolt CEP
initBolt();

// Lucide icons are handled via lucide-react components

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

