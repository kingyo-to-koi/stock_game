import { useState } from "react";
import RunnerView from "./components/RunnerView";
import AdminView from "./components/AdminView";

export default function App() {
  const [mode, setMode] = useState<"runner" | "admin">(
    typeof window !== "undefined" && window.location.hash === "#admin"
      ? "admin"
      : "runner"
  );

  // URL 해시로도 전환 가능 (#admin / #)
  if (typeof window !== "undefined") {
    window.onhashchange = () =>
      setMode(window.location.hash === "#admin" ? "admin" : "runner");
  }

  return (
    <>
      {mode === "runner" ? <RunnerView /> : <AdminView />}
      <div className="fixed top-4 right-4">
        <a className="btn-ghost" href={mode === "runner" ? "#admin" : "#"}>
          {mode === "runner" ? "운영자 모드" : "러너 모드"}
        </a>
      </div>
    </>
  );
}
