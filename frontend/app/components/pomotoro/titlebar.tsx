import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useWindowStore } from "~/stores/window";

export default function Titlebar() {
  const { isFullscreen, window } = useWindowStore();

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "justify-between bg-gray-100 items-center pl-3 items-center h-10 sticky top-0 left-0 z-99",
        isFullscreen ? "hidden" : "flex"
      )}
    >
      <Link to="/">Pomotoro</Link>
      <div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => window?.minimize()}
        >
          <Minimize2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => window?.toggleMaximize()}
        >
          <Maximize2 className="size-4" />
        </Button>
        <Button type="button" variant="ghost" onClick={() => window?.close()}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
