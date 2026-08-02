import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Radio, User, LogOut, LayoutDashboard, Settings, Tv, ChevronDown, Search } from "lucide-react";
import { fileUrl } from "@/lib/api";
import NotificationBell from "@/components/NotificationBell";
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
      className="sticky top-0 z-40 border-b border-[#27272a] bg-[#050505]/95 backdrop-blur"
    >
      <div className="w-full flex h-16 items-center justify-between px-2 sm:px-4">
        <div className="flex items-center gap-6 md:gap-8">
          <Link to="/" data-testid="brand-logo" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center border border-[#e5ff00] bg-[#e5ff00]">
              <Radio className="h-4 w-4 text-black" strokeWidth={2.5} />
            </div>
            <span className="font-display text-xl font-black tracking-tighter">
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
