import { Sidebar } from "@/components/Sidebar";

/**
 * Shell for the authenticated app pages: persistent left sidebar + content area.
 * The marketing landing page at "/" lives outside this group, so it stays
 * sidebar-free. URLs are unchanged by the route group (the "(app)" segment is
 * not part of the path).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, padding: "32px 28px", maxWidth: 1100 }}>
        {children}
      </main>
    </div>
  );
}
