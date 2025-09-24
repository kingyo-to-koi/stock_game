import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AdminView from "./components/AdminView"; // 너가 만든 AdminView 컴포넌트 위치

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AdminView />
  </React.StrictMode>
);
