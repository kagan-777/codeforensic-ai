import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import Scene3D from "@/components/Scene3D";

export const metadata = { title: "Log in · CODEFORENSIC AI" };

export default function LoginPage() {
  return (
    <AuthShell visual={<Scene3D scene="shield" />} title="Welcome back" subtitle="Log in to see your projects and scans.">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
