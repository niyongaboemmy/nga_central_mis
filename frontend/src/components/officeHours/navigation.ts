/**
 * Navigate inside the SPA from components that may render outside a Router
 * (the dashboard widget in its unit tests): push the URL and let React Router
 * pick it up from the popstate event.
 */
export const goTo = (path: string) => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};
