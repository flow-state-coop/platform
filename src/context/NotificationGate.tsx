"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type NotificationGateContextValue = {
  // Increments each time something asks to (re)evaluate the notification-prefs
  // prompt, e.g. right after an application is submitted. ConsentGate watches
  // this and re-checks the signed-in wallet, bypassing the "Not now" dismissal.
  promptSignal: number;
  promptNotificationPrefs: () => void;
};

const NotificationGateContext = createContext<NotificationGateContextValue>({
  promptSignal: 0,
  promptNotificationPrefs: () => {},
});

export function NotificationGateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [promptSignal, setPromptSignal] = useState(0);

  const promptNotificationPrefs = useCallback(() => {
    setPromptSignal((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ promptSignal, promptNotificationPrefs }),
    [promptSignal, promptNotificationPrefs],
  );

  return (
    <NotificationGateContext.Provider value={value}>
      {children}
    </NotificationGateContext.Provider>
  );
}

export function useNotificationGate() {
  return useContext(NotificationGateContext);
}
