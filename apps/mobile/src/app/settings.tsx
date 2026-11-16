import Constants from 'expo-constants';
import { router } from 'expo-router';

import { useSignOut } from '@/auth/sign-out-context';
import { SettingsScreen } from '@/features/settings/settings-screen';

// 設定（画面設計 3-7）。サインアウトするとサインイン画面に切り替わる（AuthGate）
export default function Settings() {
  const signOut = useSignOut();
  return (
    <SettingsScreen
      version={Constants.expoConfig?.version ?? '-'}
      signOut={signOut}
      onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
