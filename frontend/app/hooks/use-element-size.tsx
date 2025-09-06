import { useState, useEffect, useCallback, type RefCallback } from "react";

interface ElementSize {
  width: number;
  height: number;
}

interface UseElementSizeOptions {
  debounce?: number;
  box?: "border-box" | "content-box" | "device-pixel-content-box";
}

type MeasuredElementRef<T extends Element = Element> = RefCallback<T>;

const useElementSize = <T extends Element = Element>(
  options: UseElementSizeOptions = {}
): [MeasuredElementRef<T>, ElementSize] => {
  const { debounce = 0, box = "border-box" } = options;

  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [element, setElement] = useState<T | null>(null);

  const ref: MeasuredElementRef<T> = useCallback((node) => {
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) return;

    let timeoutId: NodeJS.Timeout | null = null;

    const updateSize = (entries: ResizeObserverEntry[]): void => {
      const updateFn = (): void => {
        if (!entries[0]) return;

        const { inlineSize: width, blockSize: height } = entries[0]
          .borderBoxSize?.[0] ??
          entries[0].contentBoxSize?.[0] ?? { inlineSize: 0, blockSize: 0 };

        setSize({ width, height });
      };

      if (debounce > 0) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(updateFn, debounce);
      } else {
        updateFn();
      }
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(element, { box });

    return () => {
      resizeObserver.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [element, debounce, box]);

  return [ref, size];
};

export default useElementSize;
