import { motion } from "framer-motion";

interface ScanningSkeletonProps {
  height?: number | string;
  width?: number | string;
  borderRadius?: number | string;
}

export default function ScanningSkeleton({
  height = "200px",
  width = "100%",
  borderRadius = "14px",
}: ScanningSkeletonProps) {
  return (
    <motion.div
      animate={{
        opacity: [0.4, 0.8, 0.4],
        boxShadow: [
          "0 0 8px rgba(200, 157, 124, 0.05)",
          "0 0 24px rgba(200, 157, 124, 0.15)",
          "0 0 8px rgba(200, 157, 124, 0.05)",
        ],
      }}
      transition={{
        duration: 2.4,
        ease: "easeInOut",
        repeat: Infinity,
      }}
      style={{
        height,
        width,
        borderRadius,
        backgroundColor: "rgba(200, 157, 124, 0.04)",
        border: "1px solid rgba(200, 157, 124, 0.1)",
      }}
    />
  );
}
