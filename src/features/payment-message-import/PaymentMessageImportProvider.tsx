import { requireNativeModule } from "expo";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { usePathname, useRouter } from "expo-router";

import type { SharedTextMessage } from "./types";

type PaymentShareModule = {
  addListener: (
    eventName: "onShare",
    listener: (event: SharedTextMessage) => void,
  ) => { remove: () => void };
  getInitialSharedText: () => Promise<SharedTextMessage | null>;
  clearSharedText: (id: string) => Promise<boolean>;
  openMessagesApp: () => Promise<boolean>;
};

type PaymentMessageImportContextValue = {
  sharedMessage: SharedTextMessage | null;
  nativeError: string | null;
  clearSharedMessage: (id: string) => Promise<void>;
  openMessagesApp: () => Promise<void>;
};

const PaymentMessageImportContext =
  createContext<PaymentMessageImportContextValue | null>(null);

function getNativeModule(): PaymentShareModule {
  return requireNativeModule<PaymentShareModule>("PaymentShareIntent");
}

export function PaymentMessageImportProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sharedMessages, setSharedMessages] = useState<SharedTextMessage[]>([]);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const seenIds = useRef(new Set<string>());
  const moduleRef = useRef<PaymentShareModule | null>(null);

  const queueShare = useCallback(
    (share: SharedTextMessage | null) => {
      if (!share || !share.id || seenIds.current.has(share.id)) return;
      seenIds.current.add(share.id);
      setSharedMessages((current) => [...current, share]);
      const isPaymentRoute =
        pathname === "/chicken-purchase" ||
        pathname === "/chicken-sale" ||
        pathname === "/egg-sale" ||
        pathname === "/expenses" ||
        /^\/expenses\/[^/]+$/.test(pathname) ||
        pathname === "/inventory/purchase" ||
        /^\/transactions\/[^/]+\/(settlements|returns)$/.test(pathname);
      if (!isPaymentRoute) {
        router.replace("/chicken-purchase");
      }
    },
    [pathname, router],
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let active = true;
    let module: PaymentShareModule;
    try {
      module = getNativeModule();
      moduleRef.current = module;
    } catch {
      setTimeout(
        () =>
          setNativeError(
            "Sharing a message into FarmTrack is unavailable in this build. You can still copy and paste a confirmation.",
          ),
        0,
      );
      return;
    }

    const subscription = module.addListener(
      "onShare",
      (share: SharedTextMessage) => {
        if (active) queueShare(share);
      },
    );
    void module
      .getInitialSharedText()
      .then((share) => {
        if (active) queueShare(share);
      })
      .catch(() => {
        if (active) {
          setNativeError("FarmTrack could not read the shared message.");
        }
      });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [queueShare]);

  const clearSharedMessage = useCallback(async (id: string) => {
    const module = moduleRef.current;
    if (Platform.OS === "android" && !module) {
      throw new Error("Android share support is not available in this build.");
    }
    if (module && !(await module.clearSharedText(id))) {
      throw new Error("FarmTrack could not clear the consumed share intent.");
    }
    setSharedMessages((current) =>
      current.filter((candidate) => candidate.id !== id),
    );
    seenIds.current.delete(id);
    setNativeError(null);
  }, []);

  const openMessagesApp = useCallback(async () => {
    const module = moduleRef.current;
    if (Platform.OS !== "android" || !module) {
      throw new Error("Opening the Messages app is unavailable in this build.");
    }
    if (!(await module.openMessagesApp())) {
      throw new Error("FarmTrack could not open the Messages app.");
    }
  }, []);

  const value = useMemo(
    () => ({
      sharedMessage: sharedMessages[0] ?? null,
      nativeError,
      clearSharedMessage,
      openMessagesApp,
    }),
    [clearSharedMessage, nativeError, openMessagesApp, sharedMessages],
  );

  return (
    <PaymentMessageImportContext.Provider value={value}>
      {children}
    </PaymentMessageImportContext.Provider>
  );
}

export function usePaymentMessageImport() {
  const value = useContext(PaymentMessageImportContext);
  if (!value) {
    throw new Error(
      "usePaymentMessageImport must be used within PaymentMessageImportProvider.",
    );
  }
  return value;
}
