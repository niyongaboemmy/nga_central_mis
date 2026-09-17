import React from "react";
import { motion } from "framer-motion";

/** Pulsing "New" pill for a just-shared item the recipient hasn't opened yet. */
const NewBadge: React.FC<{ className?: string }> = ({ className = "" }) => (
  <motion.span
    initial={{ scale: 0.8, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-500 text-white ${className}`}
  >
    <motion.span
      className="w-1.5 h-1.5 rounded-full bg-white"
      animate={{ opacity: [1, 0.3, 1] }}
      transition={{ duration: 1.4, repeat: Infinity }}
    />
    New
  </motion.span>
);

export default NewBadge;
