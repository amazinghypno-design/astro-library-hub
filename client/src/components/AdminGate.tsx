import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { IconCategory, IconChartPie, IconDocument, IconLibrary, IconStar } from "./icons";

/**
 * The admin section's own navigation, here rather than on each page because
 * every admin page already goes through this gate — and because without it
 * the pages were only reachable by typing their URL. /admin/categories had
 * shipped for weeks with nothing anywhere linking to it.
 */
const ADMIN_TABS = [
  { to: "/admin/library", label: "จัดการไฟล์", Icon: IconLibrary },
  { to: "/admin/subjects", label: "หมวดใหญ่และวิชา", Icon: IconCategory },
  { to: "/admin/usage", label: "การใช้พื้นที่", Icon: IconChartPie },
  { to: "/notes", label: "โน้ต", Icon: IconDocument },
  { to: "/skills", label: "สกิล", Icon: IconStar },
];

function AdminTabs() {
  const location = useLocation();
  return (
    <nav className="flex flex-wrap gap-1.5 pb-1">
      {ADMIN_TABS.map((tab) => {
        const active = location.pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              active
                ? "bg-navy-950 text-gold-400"
                : "text-navy-700 border border-navy-900/15 hover:border-gold-500 hover:bg-gold-400/5"
            }`}
          >
            <tab.Icon width={15} height={15} className="shrink-0" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AdminGate({ children }: { children: ReactNode }) {
  const me = trpc.auth.me.useQuery();

  if (me.isLoading) return <div className="text-navy-700/60 py-12 text-center">กำลังตรวจสอบสิทธิ์...</div>;

  if (!me.data) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-navy-700">คุณต้องเข้าสู่ระบบก่อนใช้งานส่วนผู้ดูแล</p>
        <Link to="/admin/login" className="inline-block bg-navy-950 text-ivory px-5 py-2.5 rounded-lg font-medium">
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  if (me.data.role !== "admin") {
    return <div className="py-12 text-center text-navy-700">บัญชีนี้ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแล</div>;
  }

  return (
    <div className="space-y-5">
      <AdminTabs />
      {children}
    </div>
  );
}
