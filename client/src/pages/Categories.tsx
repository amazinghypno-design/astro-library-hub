import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { IconCategory, IconSearch } from "../components/icons";

export default function Categories() {
  const [search, setSearch] = useState("");
  const categories = trpc.library.categories.useQuery({ search: search || undefined });

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">หมวดหมู่</h1>
      <div className="relative max-w-sm">
        <IconSearch width={16} height={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-700/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาหมวดหมู่..."
          className="input-field pl-10"
        />
      </div>
      {categories.isLoading && <div className="text-navy-700/60">กำลังโหลด...</div>}
      {categories.data && categories.data.length === 0 && <div className="card text-navy-700/60 py-12 text-center">ยังไม่มีหมวดหมู่ในฐานข้อมูล</div>}
      {categories.data && categories.data.length > 0 && (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {categories.data.map((cat) => (
            <Link key={cat.id} to={`/library?categoryId=${cat.id}`} className="card-interactive p-4 flex items-start gap-3">
              <IconCategory width={20} height={20} className="text-gold-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-navy-900">{cat.name}</div>
                {cat.description && <div className="text-sm text-navy-700/55 mt-1">{cat.description}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
