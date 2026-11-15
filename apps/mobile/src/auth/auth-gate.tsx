// サインインしていなければサインイン画面だけを出す（F-001-04・05・09・11）
import { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { SignInScreen, type SignInResult } from '@/features/auth/sign-in-screen';

import type { AuthStatus } from './session';

/** AuthSession のうち、画面が使う部分 */
export type SessionState = {
  readonly status: AuthStatus;
  subscribe: (listener: () => void) => () => void;
};

type Props = {
  /** Cognito の設定がなければ null（サインインを使わない） */
  session: SessionState | null;
  signIn: () => Promise<SignInResult>;
  children: ReactNode;
};

const noSubscribe = () => () => {};

export function AuthGate({ session, signIn, children }: Props) {
  const subscribe = useCallback((l: () => void) => (session ? session.subscribe(l) : noSubscribe()), [session]);
  const status = useSyncExternalStore(subscribe, () => (session ? session.status : 'signedIn'));
  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (status === 'signedOut') return <SignInScreen signIn={signIn} />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
