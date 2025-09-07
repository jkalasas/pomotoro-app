import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Logo } from "~/components/ui/logo";
import { cn } from "~/lib/utils";
import { useWindowStore } from "~/stores/window";

export default function Titlebar() {
  const { isFullscreen, window } = useWindowStore();

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "justify-between bg-background/95 backdrop-blur items-center pl-3 items-center h-10 sticky top-0 left-0 z-99 bg-primary",
        isFullscreen ? "hidden" : "flex"
      )}
    >
      <Link to="/">
        <Logo 
          textClassName="text-sm" 
          withBackground 
          backgroundClassName="bg-primary border-primary/30"
        />
      </Link>
      <div>
        <Button
        className="text-white"
          type="button"
          variant="ghost"
          onClick={() => window?.minimize()}
        >
          <Minimize2 className="size-4" />
        </Button>
        <Button
        className="text-white"
          type="button"
          variant="ghost"
          onClick={() => window?.toggleMaximize()}
        >
          <Maximize2 className="size-4" />
        </Button>
        <Button className="text-white" type="button" variant="ghost" onClick={() => window?.close()}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
