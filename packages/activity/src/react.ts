/**
 * React Router binding for nga-activity. Mount once, inside the router:
 *
 *   <ActivityRouterTracker />
 *
 * Works with react-router-dom v6/v7 and React 18/19.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { trackPage } from "./index";

export function ActivityRouterTracker(): null {
  const location = useLocation();
  const navType = useNavigationType();
  const first = useRef(true);
  useEffect(() => {
    const nav = first.current ? "load" : navType === "POP" ? "pop" : navType === "REPLACE" ? "replace" : "push";
    first.current = false;
    trackPage(location.pathname, nav);
  }, [location.pathname, navType]);
  return null;
}
