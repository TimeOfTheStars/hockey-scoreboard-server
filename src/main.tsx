import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminUsers from "./AdminUsers";
import App from "./App";
import { AuthProvider } from "./AuthContext";
import LoginPage from "./LoginPage";
import SessionHome from "./SessionHome";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<SessionHome />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/editor/:sessionId" element={<App variant="full" />} />
          <Route path="/mobile/:sessionId" element={<App variant="mobile" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
