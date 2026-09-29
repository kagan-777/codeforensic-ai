import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import { requirePageUser } from "@/lib/auth";

// Every page inside (app)/ requires login.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePageUser();
  return (
    <>
      <Navbar email={user.email} />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row md:py-8">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
