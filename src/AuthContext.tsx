import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchMe, onAuthChanged, type Me } from "./api";

type AuthState = {
  me: Me | null | undefined;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const m = await fetchMe();
      setMe(m);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "401") setMe(null);
      else setMe(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => onAuthChanged(() => void refresh()), [refresh]);

  const value = useMemo(() => ({ me, refresh }), [me, refresh]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
