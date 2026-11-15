import { Redirect } from 'expo-router';

// サインイン後の戻り先（onakalog://auth/callback）。コードの受け取りは expo-auth-session が行うので、ここはホームへ送るだけ
export default function AuthCallback() {
  return <Redirect href="/" />;
}
