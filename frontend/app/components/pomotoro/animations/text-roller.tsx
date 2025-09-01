import { motion, AnimatePresence } from "framer-motion";
import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

interface Props extends ComponentProps<"div"> {
  text: string;
}

export function TextRoller({ className, text, ...props }: Props) {
  return (
    <div
      className={cn("relative inline-block w-7 h-12 overflow-hidden", className)}
      {...props}
    >
      <AnimatePresence mode="popLayout">
        <motion.div
          key={text}
          initial={{ y: -50 }}
          animate={{ y: 0 }}
          exit={{ y: 50 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
          }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {text}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
