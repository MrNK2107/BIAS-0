import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  isPercentage?: boolean;
  duration?: number;
}

export default function AnimatedNumber({ value, isPercentage = false, duration = 1.5 }: AnimatedNumberProps) {
  // We use useSpring for a more organic feel than pure tween
  const spring = useSpring(0, {
    stiffness: 50,
    damping: 15,
    mass: 1,
    duration: duration * 1000 // duration in ms not perfectly mapping to spring, but loosely dictates feel
  });

  const displayValue = useTransform(spring, (current) => {
    if (isNaN(current)) return '-';
    if (isPercentage) return `${(current * 100).toFixed(1)}%`;
    return current.toFixed(3);
  });

  useEffect(() => {
    if (!isNaN(value)) {
      spring.set(value);
    }
  }, [value, spring]);

  return <motion.span>{displayValue}</motion.span>;
}
