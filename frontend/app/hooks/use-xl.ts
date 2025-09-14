import * as React from "react";

const XL_BREAKPOINT = 1280; // Tailwind xl breakpoint default

export function useIsXL() {
  const [isXL, setIsXL] = React.useState<boolean>(false);

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${XL_BREAKPOINT}px)`);
    const onChange = () => setIsXL(window.innerWidth >= XL_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isXL;
}
