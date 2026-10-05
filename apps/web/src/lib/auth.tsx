import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginInput, PublicUser, RegisterInput } from "@codemesh/shared";
import { api, AUTH_EXPIRED_EVENT, jsonBody } from "./api";

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [optimisticUser, setOptimisticUser] = useState<PublicUser | null>(null);
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api<{ user: PublicUser | null }>("/api/auth/me"),
    retry: false
  });

  useEffect(() => {
    const handleExpiredSession = () => {
      setOptimisticUser(null);
      queryClient.setQueryData(["auth", "me"], { user: null });
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
  }, [queryClient]);

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) =>
      api<{ user: PublicUser }>("/api/auth/login", { method: "POST", body: jsonBody(input) }),
    onSuccess: ({ user }) => {
      setOptimisticUser(user);
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    }
  });

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) =>
      api<{ user: PublicUser }>("/api/auth/register", { method: "POST", body: jsonBody(input) }),
    onSuccess: ({ user }) => {
      setOptimisticUser(user);
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: () => api<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      setOptimisticUser(null);
      queryClient.clear();
    }
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: optimisticUser ?? me.data?.user ?? null,
      loading: me.isLoading,
      login: async (input) => {
        await loginMutation.mutateAsync(input);
      },
      register: async (input) => {
        await registerMutation.mutateAsync(input);
      },
      logout: async () => {
        await logoutMutation.mutateAsync();
      }
    }),
    [loginMutation, logoutMutation, me.data?.user, me.isLoading, optimisticUser, registerMutation]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
