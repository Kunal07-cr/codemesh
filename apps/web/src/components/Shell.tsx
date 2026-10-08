import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowUp, Boxes, Gauge, House, LogOut, Network, Search, Shield, Workflow } from "lucide-react";
import { useAuth } from "../lib/auth";
import { initials } from "../lib/format";
import { AmbientCodeStream } from "./AmbientCodeStream";
import { AppearancePanel } from "./AppearancePanel";
import { CommandPalette } from "./CommandPalette";

export function Shell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const fetching = useIsFetching();
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const update = () => {
      setShowScrollTop(window.scrollY > 500);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -28px", threshold: 0.08 });

    const register = (scope: ParentNode) => {
      scope.querySelectorAll<HTMLElement>("[data-reveal]:not(.cm-reveal-ready)").forEach((element) => {
        element.classList.add("cm-reveal-ready");
        if (reducedMotion) element.classList.add("is-revealed");
        else observer.observe(element);
      });
    };

    register(root);
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.matches("[data-reveal]")) register(node.parentElement ?? root);
          else register(node);
        }
      }));
    });
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, [location.pathname]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.routeTone = routeTone(location.pathname);
    return () => {
      delete root.dataset.routeTone;
    };
  }, [location.pathname]);

  useEffect(() => {
    const root = document.documentElement;
    let activeSurface: HTMLElement | null = null;
    let pointerFrame = 0;
    let queuedPointer: PointerEvent | null = null;

    const reducedMotion = () => root.dataset.motion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clearSurface = () => {
      if (!activeSurface) return;
      activeSurface.classList.remove("cm-interactive-surface");
      activeSurface.style.removeProperty("--cm-tilt-x");
      activeSurface.style.removeProperty("--cm-tilt-y");
      activeSurface = null;
    };

    const renderPointer = () => {
      pointerFrame = 0;
      const event = queuedPointer;
      queuedPointer = null;
      if (!event || reducedMotion() || event.pointerType === "touch") {
        clearSurface();
        return;
      }

      const shiftX = ((event.clientX / window.innerWidth) - 0.5) * 14;
      const shiftY = ((event.clientY / window.innerHeight) - 0.5) * 10;
      root.style.setProperty("--cm-pointer-shift-x", `${shiftX.toFixed(2)}px`);
      root.style.setProperty("--cm-pointer-shift-y", `${shiftY.toFixed(2)}px`);

      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>(".surface-panel, .lp-hero-card, .lp-trace-col, .lp-terminal-body")
        : null;
      const blocked = target?.closest(".cm-workspace-grid, .cm-universe-page, .react-flow, [data-no-tilt]");
      if (!target || blocked) {
        clearSurface();
        return;
      }

      const rect = target.getBoundingClientRect();
      if (rect.width > 720 || rect.height > 480 || rect.width < 160) {
        clearSurface();
        return;
      }

      if (activeSurface !== target) {
        clearSurface();
        activeSurface = target;
        activeSurface.classList.add("cm-interactive-surface");
      }
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      target.style.setProperty("--cm-tilt-x", `${((0.5 - y) * 2.4).toFixed(2)}deg`);
      target.style.setProperty("--cm-tilt-y", `${((x - 0.5) * 3.2).toFixed(2)}deg`);
    };

    const movePointer = (event: PointerEvent) => {
      queuedPointer = event;
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(renderPointer);
    };

    const pressControl = (event: PointerEvent) => {
      if (reducedMotion() || event.pointerType === "touch") return;
      const control = event.target instanceof Element
        ? event.target.closest<HTMLElement>('button:not(:disabled), a[href], [role="button"]')
        : null;
      const layer = document.querySelector<HTMLElement>(".cm-interaction-layer");
      if (!control || !layer) return;

      const signal = document.createElement("span");
      signal.className = "cm-press-signal";
      signal.style.left = `${event.clientX}px`;
      signal.style.top = `${event.clientY}px`;
      layer.appendChild(signal);
      signal.addEventListener("animationend", () => signal.remove(), { once: true });
    };

    window.addEventListener("pointermove", movePointer, { passive: true });
    window.addEventListener("pointerdown", pressControl, { passive: true });
    window.addEventListener("blur", clearSurface);
    document.documentElement.addEventListener("mouseleave", clearSurface);
    return () => {
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      window.removeEventListener("pointermove", movePointer);
      window.removeEventListener("pointerdown", pressControl);
      window.removeEventListener("blur", clearSurface);
      document.documentElement.removeEventListener("mouseleave", clearSurface);
      root.style.removeProperty("--cm-pointer-shift-x");
      root.style.removeProperty("--cm-pointer-shift-y");
      clearSurface();
    };
  }, []);

  return (
    <div className="cm-app-shell min-h-screen text-slate-100">
      <div className="cm-atmosphere" aria-hidden="true">
        <span className="cm-spectrum-rail cm-spectrum-rail-one" />
        <span className="cm-spectrum-rail cm-spectrum-rail-two" />
        <span className="cm-spectrum-rail cm-spectrum-rail-three" />
      </div>
      <AmbientCodeStream />
      <div className="cm-interaction-layer" aria-hidden="true" />
      <div className={`cm-network-progress ${fetching > 0 ? "is-active" : ""}`} aria-hidden="true" />
      <header className="cm-shell-header sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link to="/" className="cm-brand group flex items-center gap-2 font-semibold tracking-wide text-white">
            <Boxes className="cm-logo-mark h-5 w-5 text-mint" />
            CodeMesh
          </Link>
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {location.pathname === "/" ? (
              <>
                <a data-tone="mint" className="cm-nav-link flex items-center gap-2 rounded px-3 py-2 text-steel hover:bg-panel hover:text-white" href="#demo"><Network className="h-4 w-4" /> Demo</a>
                <a data-tone="cyan" className="cm-nav-link flex items-center gap-2 rounded px-3 py-2 text-steel hover:bg-panel hover:text-white" href="#calculator"><Workflow className="h-4 w-4" /> Savings</a>
                <NavLink data-tone="violet" className={navClass} to="/discover"><Search className="h-4 w-4" /> Discover</NavLink>
                <NavLink data-tone="coral" className={navClass} to="/dashboard"><Gauge className="h-4 w-4" /> Dashboard</NavLink>
              </>
            ) : (
              <>
                <NavLink data-tone="cyan" className={navClass} to="/discover"><Search className="h-4 w-4" /> Discover</NavLink>
                <NavLink data-tone="violet" className={navClass} to="/dashboard"><Gauge className="h-4 w-4" /> Dashboard</NavLink>
                <NavLink data-tone="amber" className={navClass} to="/docs"><Shield className="h-4 w-4" /> Docs</NavLink>
              </>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <CommandPalette />
            <AppearancePanel />
            {user ? (
              <>
                <div className="hidden text-right text-sm sm:block">
                  <div className="text-white">{user.name}</div>
                  <div className="text-xs text-steel">{user.email}</div>
                </div>
                <div className="cm-avatar grid h-8 w-8 place-items-center rounded border border-line bg-panel text-xs font-bold text-mint">
                  {initials(user.name)}
                </div>
                <button
                  className="rounded border border-line p-2 text-steel hover:border-coral hover:text-coral"
                  title="Log out"
                  onClick={() => void logout()}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <a className="cm-sign-in rounded border border-mint/40 px-3 py-1.5 text-sm text-mint hover:bg-mint/10" href="/#account">
                Sign in
              </a>
            )}
          </div>
        </div>
      </header>
      <main key={location.pathname} className="cm-page-enter pb-16 md:pb-0">
        <Outlet />
      </main>
      <nav className="cm-mobile-nav fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-4 border-t border-line bg-ink/95 px-2 backdrop-blur-xl md:hidden" aria-label="Mobile navigation">
        <NavLink className={mobileNavClass} to="/" end><House className="h-4 w-4" /><span>Home</span></NavLink>
        <NavLink className={mobileNavClass} to="/discover"><Search className="h-4 w-4" /><span>Discover</span></NavLink>
        <NavLink className={mobileNavClass} to="/dashboard"><Gauge className="h-4 w-4" /><span>Dashboard</span></NavLink>
        <NavLink className={mobileNavClass} to="/docs"><Shield className="h-4 w-4" /><span>Docs</span></NavLink>
      </nav>
      {showScrollTop && (
        <button
          className="cm-scroll-top"
          type="button"
          title="Back to top"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: document.documentElement.dataset.motion === "reduced" ? "auto" : "smooth" })}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return `cm-nav-link flex items-center gap-2 rounded px-3 py-2 ${
    isActive ? "is-active bg-panel text-white" : "text-steel hover:bg-panel hover:text-white"
  }`;
}

function mobileNavClass({ isActive }: { isActive: boolean }) {
  return `flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] ${isActive ? "text-mint" : "text-steel"}`;
}

function routeTone(pathname: string) {
  if (pathname === "/") return "spectrum";
  if (pathname.includes("/universe")) return "cyan";
  if (pathname.includes("/assistant") || pathname.includes("/intelligence")) return "violet";
  if (pathname.includes("/control-room") || pathname.includes("/operations")) return "coral";
  if (pathname.includes("/delivery") || pathname.includes("/labs")) return "rose";
  if (pathname.includes("/workspace")) return "mint";
  if (pathname === "/docs") return "amber";
  return "spectrum";
}

