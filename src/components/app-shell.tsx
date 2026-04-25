import { Sidebar } from "./sidebar";

export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 min-h-screen">
      <Sidebar userEmail={userEmail} />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
