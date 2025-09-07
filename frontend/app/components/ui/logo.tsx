import { cn } from "~/lib/utils";

interface LogoProps {
  className?: string;
  showText?: boolean;
  textClassName?: string;
  withBackground?: boolean;
  backgroundClassName?: string;
}

export function Logo({ 
  className, 
  showText = false, 
  textClassName,
  withBackground = false,
  backgroundClassName 
}: LogoProps) {
  const logoElement = (
    <img 
      src="/images/logo.svg" 
      alt="Pomotoro" 
      className={cn("h-6 w-6", className)} 
    />
  );

  if (withBackground && showText) {
    // When background is enabled and text is shown, include both in the background
    return (
      <div className={cn(
        "rounded-md px-2 py-1 bg-primary/10 border border-primary/20 flex items-center space-x-2",
        backgroundClassName
      )}>
        {logoElement}
        <span className={cn("font-semibold text-white", textClassName)}>
          POMOTORO
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      {withBackground ? (
        <div className={cn(
          "rounded-md p-1 bg-primary/10 border border-primary/20",
          backgroundClassName
        )}>
          {logoElement}
        </div>
      ) : (
        logoElement
      )}
      {showText && (
        <span className={cn("font-semibold", textClassName)}>
          POMOTORO
        </span>
      )}
    </div>
  );
}

export function LogoIcon({ className }: { className?: string }) {
  return (
    <img 
      src="/images/logo.svg" 
      alt="Pomotoro" 
      className={cn("h-4 w-4", className)} 
    />
  );
}
