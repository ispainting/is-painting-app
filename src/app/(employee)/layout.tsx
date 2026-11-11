import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { postLoginRedirectPath } from "@/lib/employee-login";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Employees use the clock portal; admins retain access for testing and
  // management. Any other role lands on its own authorized start page.
  if (session.role !== "employee" && session.role !== "admin") {
    redirect(postLoginRedirectPath(session.role));
  }
  return <div className="min-h-screen bg-slate-50 p-4 max-w-md mx-auto">{children}</div>;
}
