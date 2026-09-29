import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import Scene3D from "@/components/Scene3D";

export const metadata = { title: "Sign up · CODEFORENSIC AI" };

export default function SignupPage() {
  return (
    <AuthShell visual={<Scene3D scene="helix" />} title="Create your account" subtitle="Your projects and scans are private to your account.">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthShell>
  );
}
