import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import WhatsAppDemo from "./pages/WhatsAppDemo";
import "./styles/global.css";

// Separate public build: no AppProvider, API client, service worker or secrets.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <WhatsAppDemo />
    </BrowserRouter>
  </StrictMode>,
);
