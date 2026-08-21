import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

function getSystemTheme(): Theme {
  return window.matchMedia(SYSTEM_DARK_QUERY).matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getSystemTheme);

  useEffect(() => {
    const systemTheme = window.matchMedia(SYSTEM_DARK_QUERY);
    const syncWithSystem = (event: MediaQueryListEvent) => {
      setTheme(event.matches ? "dark" : "light");
    };

    systemTheme.addEventListener("change", syncWithSystem);
    return () => systemTheme.removeEventListener("change", syncWithSystem);
  }, []);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggle };
}
