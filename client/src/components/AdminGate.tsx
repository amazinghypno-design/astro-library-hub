import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

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

  return <>{children}</>;
}
