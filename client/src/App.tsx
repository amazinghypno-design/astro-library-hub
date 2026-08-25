import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";

// Only the homepage ships in the entry bundle. Everything else is split out —
// FileDetail/ShareView pull in pdfjs and the admin pages pull in the upload and
// editing UI, which together tripled the JavaScript a first-time visitor had to
// download and parse before the homepage could paint. Home itself stays eager
// so the landing route never costs an extra round-trip.
const Search = lazy(() => import("./pages/Search"));
const Catalog = lazy(() => import("./pages/Catalog"));
const Categories = lazy(() => import("./pages/Categories"));
const FileDetail = lazy(() => import("./pages/FileDetail"));
const AuthorWorks = lazy(() => import("./pages/AuthorWorks"));
const ShareView = lazy(() => import("./pages/ShareView"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminLibrary = lazy(() => import("./pages/admin/AdminLibrary"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminUsage = lazy(() => import("./pages/admin/AdminUsage"));

function RouteFallback() {
  return (
    <div className="py-16 flex items-center justify-center" role="status" aria-label="กำลังโหลดหน้า">
      <span aria-hidden className="w-6 h-6 rounded-full border-2 border-navy-900/15 border-t-gold-600 animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Catalog />} />
          <Route path="/ebooks" element={<Catalog forcedType="ebook" />} />
          <Route path="/documents" element={<Catalog forcedType="document" />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/file/:id" element={<FileDetail />} />
          <Route path="/author/:name" element={<AuthorWorks />} />
          <Route path="/share/:token" element={<ShareView />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/library" element={<AdminLibrary />} />
          <Route path="/admin/categories" element={<AdminCategories />} />
          <Route path="/admin/usage" element={<AdminUsage />} />
          <Route path="*" element={<div className="py-12 text-center text-navy-700">ไม่พบหน้านี้</div>} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
