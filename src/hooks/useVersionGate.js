// useVersionGate — runs the min-version check once on mount and
// exposes { loading, gateResult } to the caller. Kept separate from
// the service so the App root has zero business logic — it just asks
// "should I show the app or the update screen?" and renders.

import { useEffect, useState } from 'react';
import { checkVersionGate } from '../services/versionGate';

// Poll the version gate on mount. Returns { loading, gateResult } where
// gateResult is what checkVersionGate returned (either { blocked: false }
// or the full blocked payload). No re-checks after mount — a user who
// launches the app and passes the gate stays passed for the session;
// they'd have to force-close and reopen to re-check. That's intentional:
// blocking someone mid-flow would eat their in-progress state (recording
// a snapple, mid-round in a game).
export function useVersionGate() {
  const [loading, setLoading] = useState(true);
  const [gateResult, setGateResult] = useState({ blocked: false });

  useEffect(() => {
    let cancelled = false;
    checkVersionGate()
      .then((result) => {
        if (!cancelled) setGateResult(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { loading, gateResult };
}
