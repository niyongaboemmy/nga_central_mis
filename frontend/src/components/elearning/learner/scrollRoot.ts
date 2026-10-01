import { createContext, useContext } from "react";

/**
 * The element the course page scrolls. From lg the page has a fixed height and only the
 * centre column scrolls (the week list stays put); on phones the window scrolls, so this
 * is null and everything falls back to window scrolling.
 */
export const LearnerScrollRoot = createContext<HTMLElement | null>(null);
export const useLearnerScrollRoot = () => useContext(LearnerScrollRoot);
