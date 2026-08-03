import { useState, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Radio, User, LogOut, LayoutDashboard, Settings, Tv, ChevronDown, Search, Sun, Moon } from "lucide-react";
import { fileUrl } from "@/lib/api";
import NotificationBell from "@/components/NotificationBell";
// Transparent yellow speech bubble logo sticker icon with cute cartoon eyes
function SpeechBubbleLogo({ className = "h-10 w-10" }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="bubbleYellowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f3ff26" />
          <stop offset="100%" stopColor="#d5ee00" />
        </linearGradient>
      </defs>

      {/* Outer White Sticker Outline */}
      <path
        d="M 28 12 L 72 12 A 16 16 0 0 1 88 28 L 88 60 A 16 16 0 0 1 72 76 L 34 76 L 19 89 C 16 91 11 88 13 84 L 16 75 A 16 16 0 0 1 12 60 L 12 28 A 16 16 0 0 1 28 12 Z"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="6"
        strokeLinejoin="round"
      />

      {/* Inner Black Outline & Yellow Fill */}
      <path
        d="M 28 15 L 72 15 A 13 13 0 0 1 85 28 L 85 58 A 13 13 0 0 1 72 71 L 34 71 L 21 82 C 19 83.5 16 81.5 17 78.5 L 18.5 70.5 A 13 13 0 0 1 15 58 L 15 28 A 13 13 0 0 1 28 15 Z"
        fill="url(#bubbleYellowGrad)"
        stroke="#0d0d0d"
        strokeWidth="5"
        strokeLinejoin="round"
      />

      {/* Left Cartoon Eye */}
      <circle cx="37" cy="43" r="8.5" fill="#0d0d0d" />
      <circle cx="34.5" cy="40.5" r="3" fill="#ffffff" />
      <circle cx="39.5" cy="45.5" r="1.3" fill="#ffffff" />

      {/* Right Cartoon Eye */}
      <circle cx="63" cy="43" r="8.5" fill="#0d0d0d" />
      <circle cx="60.5" cy="40.5" r="3" fill="#ffffff" />
      <circle cx="65.5" cy="45.5" r="1.3" fill="#ffffff" />
    </svg>
  );
}
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [navSearch, setNavSearch] = useState("");
  const [isLight, setIsLight] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sparkz_theme") === "light";
    }
    return false;
  });

  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.add("light");
      localStorage.setItem("sparkz_theme", "light");
    } else {
      document.documentElement.classList.remove("light");
      localStorage.setItem("sparkz_theme", "dark");
    }
  }, [isLight]);

  const toggleTheme = () => setIsLight((prev) => !prev);

  const onLogout = () => {
    logout();
    navigate("/");
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (navSearch.trim()) {
      navigate(`/directory?q=${encodeURIComponent(navSearch.trim())}`);
      setNavSearch("");
    } else {
      navigate("/directory");
    }
  };

  return (
    <header
      data-testid="site-navbar"
      className="fixed top-0 left-0 right-0 z-40 border-b border-[#27272a] bg-[#050505]/95 backdrop-blur w-full"
    >
      <div className="w-full flex h-16 items-center justify-between px-2 sm:px-4">
        <div className="flex items-center gap-6 md:gap-8">
          <Link to="/" data-testid="brand-logo" className="flex items-center gap-2">
            <SpeechBubbleLogo className="h-10 w-10 sm:h-11 sm:w-11 animate-flip-2min drop-shadow" />
            <span className="inline-block font-display text-xl font-black tracking-tighter animate-flip-2min">
              SPARKZ<span className="text-[#e5ff00]">.TV</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <NavItem to="/" testid="nav-browse">
              BROWSE
            </NavItem>
            <NavItem to="/directory" testid="nav-directory">
              DIRECTORY
            </NavItem>
            <NavItem to="/lounge" testid="nav-lounge">
              THE LOUNGE
            </NavItem>
            {user && (
              <NavItem to="/dashboard" testid="nav-dashboard">
                STUDIO
              </NavItem>
            )}
          </nav>
        </div>

        {/* Global Nav Search Bar */}
        <form onSubmit={handleSearchSubmit} className="hidden sm:flex items-center relative max-w-xs flex-1 mx-4">
          <Search className="absolute left-3 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            placeholder="Search DJs, genres, channels..."
            className="w-full border border-[#27272a] bg-black py-1.5 pl-9 pr-3 font-mono text-xs text-white placeholder-zinc-500 focus:border-[#e5ff00] focus:outline-none transition-colors"
            data-testid="navbar-search-input"
          />
        </form>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            data-testid="theme-toggle-btn"
            className="flex items-center gap-1.5 border border-[#27272a] bg-black px-2.5 py-1.5 font-mono text-[11px] uppercase font-bold tracking-wider text-zinc-300 hover:border-[#e5ff00] hover:text-[#e5ff00] transition-colors"
            title={isLight ? "Switch to Original Dark Cyber Theme" : "Switch to Light Theme"}
            aria-label="Toggle Color Theme"
          >
            {isLight ? (
              <>
                <Moon className="h-3.5 w-3.5 text-indigo-500" />
                <span className="hidden sm:inline">DARK</span>
              </>
            ) : (
              <>
                <Sun className="h-3.5 w-3.5 text-[#e5ff00]" />
                <span className="hidden sm:inline">LIGHT</span>
              </>
            )}
          </button>

          {user === undefined ? null : user ? (
            <>
              <NotificationBell />
              <UserMenu user={user} onLogout={onLogout} />
            </>
          ) : (
            <>
              <Link to="/login" data-testid="nav-login" className="btn-ghost">
                LOGIN
              </Link>
              <Link to="/register" data-testid="nav-register" className="btn-primary">
                START BROADCASTING
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function UserMenu({ user, onLogout }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="user-menu-trigger"
          className="flex items-center gap-2 border border-[#27272a] px-3 py-2 transition-colors hover:border-white focus:border-[#e5ff00] focus:outline-none"
        >
          {user.photo_url ? (
            <img
              src={fileUrl(user.photo_url)}
              alt=""
              className="h-6 w-6 object-cover grayscale contrast-125"
            />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center border border-[#27272a]">
              <User className="h-3 w-3" />
            </div>
          )}
          <span className="hidden font-mono text-xs uppercase tracking-widest sm:inline">
            {user.username}
          </span>
          <ChevronDown className="h-3 w-3 text-zinc-500" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        data-testid="user-menu-content"
        className="w-56 border-[#27272a] bg-[#050505] p-0"
        style={{ borderRadius: 0 }}
      >
        <DropdownMenuLabel className="border-b border-[#27272a] px-3 py-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            SIGNED IN AS
          </div>
          <div className="mt-1 truncate font-display text-sm font-black">
            {user.display_name}
          </div>
          <div className="truncate font-mono text-[10px] text-zinc-500">
            @{user.username}
          </div>
        </DropdownMenuLabel>
        <MenuLink
          to={`/channel/${user.username}`}
          icon={<Tv className="h-3.5 w-3.5" />}
          testid="user-menu-my-channel"
        >
          MY CHANNEL
        </MenuLink>
        <MenuLink
          to="/dashboard"
          icon={<LayoutDashboard className="h-3.5 w-3.5" />}
          testid="user-menu-studio"
        >
          STUDIO
        </MenuLink>
        <MenuLink
          to="/profile"
          icon={<Settings className="h-3.5 w-3.5" />}
          testid="user-menu-profile"
        >
          PROFILE SETTINGS
        </MenuLink>
        <DropdownMenuSeparator className="my-0 bg-[#27272a]" />
        <DropdownMenuItem
          data-testid="user-menu-logout"
          onSelect={onLogout}
          className="flex cursor-pointer items-center gap-2 border-t border-[#27272a] px-3 py-3 font-mono text-xs uppercase tracking-widest text-[#ff3b30] focus:bg-[#0f0f0f] focus:text-[#ff3b30]"
          style={{ borderRadius: 0 }}
        >
          <LogOut className="h-3.5 w-3.5" />
          LOG OUT
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuLink({ to, icon, children, testid }) {
  return (
    <DropdownMenuItem asChild data-testid={testid} style={{ borderRadius: 0 }}>
      <Link
        to={to}
        className="flex cursor-pointer items-center gap-2 px-3 py-3 font-mono text-xs uppercase tracking-widest text-zinc-200 hover:bg-[#0f0f0f] focus:bg-[#0f0f0f] focus:text-white"
      >
        {icon}
        {children}
      </Link>
    </DropdownMenuItem>
  );
}

function NavItem({ to, children, testid }) {
  return (
    <NavLink
      to={to}
      end
      data-testid={testid}
      className={({ isActive }) =>
        `px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] transition-colors ${
          isActive ? "text-[#e5ff00]" : "text-zinc-400 hover:text-white"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
