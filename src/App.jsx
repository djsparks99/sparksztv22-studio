import "@/App.css";
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import Navbar from "@/components/Navbar";
import FrequencyShoutboxTicker from "@/components/FrequencyShoutboxTicker";
import LiveSidebar from "@/components/LiveSidebar";
import UsernameLockModal from "@/components/UsernameLockModal";
import Browse from "@/pages/Browse";
import Directory from "@/pages/Directory";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Channel from "@/pages/Channel";
import Dashboard from "@/pages/Dashboard";
import Profile from "@/pages/Profile";
import { useLivepeerAutoPoll } from "@/hooks/useLivepeerAutoPoll";

const SIDEBAR_STORAGE_KEY = "sparkz_sidebar_collapsed";

function ProtectedLayout() {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-24">
        <div className="h-40 animate-pulse bg-[#0a0a0a]" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <Outlet />;
}

function useSidebarCollapsed() {
  // Reflect the collapsed flag from LiveSidebar for main-content offset.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1"
  );
  useEffect(() => {
    const onStorage = () => {
      setCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1");
    };
    window.addEventListener("storage", onStorage);
    // Also poll on interval since same-tab writes don't fire the storage event
    const t = setInterval(onStorage, 300);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, []);
  return collapsed;
}

function SiteLayout() {
  const { user } = useAuth();
  const collapsed = useSidebarCollapsed();
  useLivepeerAutoPoll();
  const hasSidebar = !!user;
  const sidebarWidthClass = hasSidebar
    ? collapsed
      ? "lg:pl-[56px]"
      : "lg:pl-[240px]"
    : "";

  return (
    <>
      <Navbar />
      <FrequencyShoutboxTicker />
      <LiveSidebar />
      <div className={sidebarWidthClass}>
        <main className="relative z-10">
          <Outlet />
        </main>
        <footer className="mt-16 border-t border-[#27272a] bg-[#050505]">
          <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-600">
              © SPARKZ.TV — BROADCASTING FROM SOMEWHERE
            </div>
            <div className="flex gap-4 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-600">
              <span>PWR: LIVEPEER</span>
              <span>BUILT LOUD</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}

export default function App() {
  useEffect(() => {
    // Force page title back after analytics script may overwrite it
    document.title = "Sparkz.TV — Underground Live Streaming";
  }, []);

  return (
    <AuthProvider>
      <UsernameLockModal />
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<SiteLayout />}>
            <Route path="/" element={<Browse />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/channel/:username" element={<Channel />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "#050505",
            border: "1px solid #27272a",
            color: "#fff",
            borderRadius: 0,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          },
        }}
      />
    </AuthProvider>
  );
}
