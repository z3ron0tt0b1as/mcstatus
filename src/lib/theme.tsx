import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "imd_theme";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

function domTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialise from the class the no-flash script already set on <html>, so
  // there's no flash and the value is correct on first client render.
  const [theme, setTheme] = useState<Theme>(domTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Inline script (run before hydration) that applies the persisted theme to
 * <html> so the first paint is correct. The product is dark-by-default: only an
 * explicit "light" preference opts out. Injected as a raw string in <head>.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"){document.documentElement.classList.add("dark");}}catch(e){document.documentElement.classList.add("dark");}})();`;

/** Theme-aware colours for recharts (which needs concrete colour strings). */
export function chartPalette(theme: Theme) {
  const dark = theme === "dark";
  return {
    grid: dark ? "oklch(0.34 0.02 205)" : "oklch(0.92 0.008 180)",
    axis: dark ? "oklch(0.68 0.025 195)" : "oklch(0.5 0.02 200)",
    tooltipBg: dark ? "oklch(0.26 0.02 205)" : "oklch(1 0 0)",
    tooltipBorder: dark ? "oklch(0.4 0.025 205)" : "oklch(0.9 0.008 180)",
    tooltipText: dark ? "oklch(0.96 0.005 180)" : "oklch(0.2 0.02 200)",
    cursor: dark ? "oklch(0.46 0.03 205)" : "oklch(0.88 0.01 180)",
    up: dark ? "oklch(0.78 0.17 152)" : "oklch(0.65 0.17 152)",
    upFill: dark ? "oklch(0.78 0.17 152)" : "oklch(0.7 0.16 152)",
    players: dark ? "oklch(0.72 0.14 195)" : "oklch(0.58 0.15 200)",
  };
}
