// サインアウトの操作を画面に渡す（F-001-14）。サインインを使っていなければ null（F-001-16）
import { createContext, useContext, type ReactNode } from 'react';

type SignOut = (() => Promise<void>) | null;

const SignOutContext = createContext<SignOut>(null);

export function SignOutProvider({ signOut, children }: { signOut: SignOut; children: ReactNode }) {
  return <SignOutContext.Provider value={signOut}>{children}</SignOutContext.Provider>;
}

export function useSignOut(): SignOut {
  return useContext(SignOutContext);
}
