import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { IconLock } from "../../components/icons";
import { toThaiErrorMessage } from "../../lib/errorMessages";

export default function AdminLogin() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate("/admin/library");
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate({ email, password });
  }

  return (
    <div className="max-w-sm mx-auto py-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-navy-950 text-gold-400 rounded-xl p-2.5">
          <IconLock width={20} height={20} />
        </div>
        <h1 className="font-serif text-2xl font-semibold text-navy-900">เข้าสู่ระบบผู้ดูแล</h1>
      </div>
      <form onSubmit={onSubmit} className="card p-5 space-y-4">
        <div>
          <label htmlFor="email" className="label-field">
            อีเมล
          </label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" />
        </div>
        <div>
          <label htmlFor="password" className="label-field">
            รหัสผ่าน
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
          />
        </div>
        {login.error && (
          <div className="text-red-700 text-sm">
            {toThaiErrorMessage(login.error, "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")}
          </div>
        )}
        <button type="submit" disabled={login.isLoading} className="btn-primary w-full">
          {login.isLoading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
