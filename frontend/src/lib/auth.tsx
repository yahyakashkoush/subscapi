import React, { createContext, useContext, useEffect, type ReactNode } from "react";
import { useUser, useClerk } from "@clerk/react";

export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  isAdmin: boolean;
};

export const ADMIN_EMAILS = [
  "yahyaemad999@gmail.com",
  "yahyaemadkashkoush@gmail.com",
];

type AuthContextType = {
  user: User | null;
  token: string | null;
  isSignedIn: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: () => void;
  register: () => void;
  logout: () => void;
  openAuthModal: (tab?: "login" | "register") => void;
  closeAuthModal: () => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isSignedIn: false,
  isAdmin: false,
  isLoading: true,
  login: () => {},
  register: () => {},
  logout: () => {},
  openAuthModal: () => {},
  closeAuthModal: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded, user: clerkUser } = useUser();
  const { openSignIn, openSignUp, signOut } = useClerk();

  const email = (clerkUser?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
  const name =
    clerkUser?.fullName ||
    clerkUser?.firstName ||
    (email ? email.split("@")[0] : "مستخدم SubscAPI");
  const isAdmin = Boolean(isSignedIn && email && ADMIN_EMAILS.includes(email));

  const user: User | null =
    isSignedIn && clerkUser
      ? {
          id: clerkUser.id,
          name,
          email,
          role: isAdmin ? "admin" : "user",
          isAdmin,
        }
      : null;

  // Sync Clerk credentials into localStorage so api() can transparently attach them
  useEffect(() => {
    if (isSignedIn && user) {
      try {
        localStorage.setItem("subsc_clerk_email", user.email);
        localStorage.setItem("subsc_clerk_id", user.id);
        localStorage.setItem("subsc_user", JSON.stringify(user));
      } catch {}
    } else if (isLoaded && !isSignedIn) {
      try {
        localStorage.removeItem("subsc_clerk_email");
        localStorage.removeItem("subsc_clerk_id");
        localStorage.removeItem("subsc_user");
      } catch {}
    }
  }, [isSignedIn, isLoaded, user]);

  const openAuthModal = (tab?: "login" | "register") => {
    if (tab === "register") {
      openSignUp({ afterSignUpUrl: typeof window !== "undefined" ? window.location.pathname : "/" });
    } else {
      openSignIn({ afterSignInUrl: typeof window !== "undefined" ? window.location.pathname : "/" });
    }
  };

  const logout = () => {
    try {
      localStorage.removeItem("subsc_clerk_email");
      localStorage.removeItem("subsc_clerk_id");
      localStorage.removeItem("subsc_user");
    } catch {}
    signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token: null,
        isSignedIn: Boolean(isSignedIn),
        isAdmin,
        isLoading: !isLoaded,
        login: () => openSignIn(),
        register: () => openSignUp(),
        logout,
        openAuthModal,
        closeAuthModal: () => {},
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
