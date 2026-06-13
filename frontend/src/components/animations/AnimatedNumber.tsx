import { useEffect, useState } from "react";
import { motion, useSpring } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  isPercentage?: boolean;
  duration?: number;
}

export default function AnimatedNumber({
  value,
  isPercentage = false,
  duration = 1.5,
}: AnimatedNumberProps) {
  const spring = useSpring(0, {
    stiffness: 50,
    damping: 15,
    mass: 1,
    duration: duration * 1000,
  });

  const [displayText, setDisplayText] = useState("0");

  useEffect(() => {
    if (isNaN(value)) {
      setDisplayText("-");
      return;
    }
    spring.set(value);

    const unsubscribe = spring.on("change", (current: number) => {
      if (isNaN(current)) {
        setDisplayText("-");
      } else if (isPercentage) {
        setDisplayText(`${(current * 100).toFixed(1)}%`);
      } else {
        setDisplayText(current.toFixed(3));
      }
    });

    return () => unsubscribe();
  }, [value, spring, isPercentage]);

  return <motion.span>{displayText}</motion.span>;
}
