import React from "react";
import { cn } from "@/lib/utils";
import { IconLoader, Icon } from "@tabler/icons-react"; // Import Icon type as well

interface SpinnerProps {
  className?: string;
  size?: number;
  // color prop is no longer needed as it uses currentColor via the icon
}

const Spinner = React.forwardRef<
  Icon, // Use the Icon type for the ref
  SpinnerProps
>(({ className, size = 24, ...props }, ref) => {
  return (
    <IconLoader
      ref={ref} // Forward the ref to the icon
      className={cn("animate-spin", className)} // Apply animate-spin and any other classes
      size={size} // Pass the size prop
      {...props} // Pass any remaining props
    />
  );
});
Spinner.displayName = "Spinner";

export { Spinner };
