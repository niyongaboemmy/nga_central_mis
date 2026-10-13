import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { closePlayground, subscribePlayground, type PlaygroundRequest } from "./store";
import { usePermissions } from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";

// The editor, formatter and runner load only when someone opens the playground.
const CodePlaygroundModal = lazy(() => import("./CodePlaygroundModal"));

/**
 * Mounted once (App): shows the playground whenever something calls openPlayground().
 * Only for users with CODE_PLAYGROUND_USE — without a host, lesson code shows no Run.
 */
const CodePlaygroundHost: React.FC = () => {
  const allowed = usePermissions().hasPermission(Permissions.CODE_PLAYGROUND_USE);
  const [request, setRequest] = useState<PlaygroundRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!allowed) return;
    return subscribePlayground((r) => {
      setRequest(r);
      if (r) setLoaded(true);
    });
  }, [allowed]);
  const onClose = useCallback(() => closePlayground(), []);
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <CodePlaygroundModal request={request} onClose={onClose} />
    </Suspense>
  );
};

export default CodePlaygroundHost;
