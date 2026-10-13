import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { closePlayground, subscribePlayground, type PlaygroundRequest } from "./store";

// The editor, formatter and runner load only when someone opens the playground.
const CodePlaygroundModal = lazy(() => import("./CodePlaygroundModal"));

/** Mounted once (App): shows the playground whenever something calls openPlayground(). */
const CodePlaygroundHost: React.FC = () => {
  const [request, setRequest] = useState<PlaygroundRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(
    () =>
      subscribePlayground((r) => {
        setRequest(r);
        if (r) setLoaded(true);
      }),
    [],
  );
  const onClose = useCallback(() => closePlayground(), []);
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <CodePlaygroundModal request={request} onClose={onClose} />
    </Suspense>
  );
};

export default CodePlaygroundHost;
