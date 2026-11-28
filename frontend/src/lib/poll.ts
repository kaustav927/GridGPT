// Wraps a polling callback so it does nothing while the tab is in the background.
// Hidden tabs left open for days otherwise keep hitting the API every 30-60 seconds.
export const whenVisible = (fn: () => unknown) => () => {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') fn();
};
