import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <div className="min-h-screen bg-slate-50 p-4 max-w-md mx-auto">{children}</div>;
}
