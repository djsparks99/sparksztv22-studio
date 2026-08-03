import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import Navbar from "@/components/Navbar";
import LiveSidebar from "@/components/LiveSidebar";
import UsernameLockModal from "@/components/UsernameLockModal";
import Footer from "@/components/Footer";
import Browse from "@/pages/Browse";
import Directory from "@/pages/Directory";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Channel from "@/pages/Channel";
import Dashboard from "@/pages/Dashboard";
import Profile from "@/pages/Profile";
import Lounge from "@/pages/Lounge";
import ObsOverlay from "@/pages/ObsOverlay";
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
    window.addEventListener("sidebar-toggle", onStorage);
    const t = setInterval(onStorage, 300);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sidebar-toggle", onStorage);
      clearInterval(t);
    };
  }, []);
  return collapsed;
}

function SiteLayout() {
  const { user } = useAuth();
  const collapsed = useSidebarCollapsed();
  useLivepeerAutoPoll();
  const sidebarWidthClass = collapsed ? "lg:pl-[60px]" : "lg:pl-[240px]";

  return (
    <>
      <Navbar />
      <LiveSidebar />
      <div className={`${sidebarWidthClass} pt-16`}>
        <main className="relative z-10">
          <Outlet />
        </main>
        <Footer />
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
          <Route path="/overlay/:username" element={<ObsOverlay />} />
          <Route element={<SiteLayout />}>
            <Route path="/" element={<Browse />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/channel/:username" element={<Channel />} />
            <Route path="/lounge" element={<Lounge />} />
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
