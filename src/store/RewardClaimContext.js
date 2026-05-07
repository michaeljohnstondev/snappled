import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import RewardClaimOverlay from '../components/ui/RewardClaimOverlay';

const RewardClaimContext = createContext(null);

export function useRewardClaim() {
  const ctx = useContext(RewardClaimContext);
  if (!ctx) throw new Error('useRewardClaim must be used within RewardClaimProvider');
  return ctx;
}

// Provider sits high in the tree (App.js). Screens call:
//   claimRewards({ rewards, title, subtitle, commit })
//   flyRewards({ rewards, commit })
// Both return a Promise that resolves once the visual animation is done.
//
// `commit` is fired at the apex of the fly animation — that's when the
// caller should write rewards to Firestore. Doing it here means the
// resource bar's tick-up lines up with the icons landing.
export function RewardClaimProvider({ children }) {
  const [pending, setPending] = useState(null); // { mode, rewards, title, subtitle, commit, resolve }
  const queueRef = useRef([]);

  const runNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (next) {
      setPending(next);
    } else {
      setPending(null);
    }
  }, []);

  const enqueue = useCallback((entry) => {
    return new Promise((resolve) => {
      const item = { ...entry, resolve };
      if (pending) {
        queueRef.current.push(item);
      } else {
        setPending(item);
      }
    });
  }, [pending]);

  const claimRewards = useCallback(({ rewards, title, subtitle, commit }) => {
    return enqueue({ mode: 'modal', rewards, title, subtitle, commit });
  }, [enqueue]);

  const flyRewards = useCallback(({ rewards, commit }) => {
    return enqueue({ mode: 'fly', rewards, commit });
  }, [enqueue]);

  const handleDone = useCallback(() => {
    pending?.resolve?.();
    runNext();
  }, [pending, runNext]);

  return (
    <RewardClaimContext.Provider value={{ claimRewards, flyRewards }}>
      {children}
      {pending && (
        <RewardClaimOverlay
          key={pending.resolve} // remount per claim
          mode={pending.mode}
          rewards={pending.rewards}
          title={pending.title}
          subtitle={pending.subtitle}
          commit={pending.commit}
          onDone={handleDone}
        />
      )}
    </RewardClaimContext.Provider>
  );
}
