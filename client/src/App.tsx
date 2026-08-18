import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Search from "./pages/Search";
import Catalog from "./pages/Catalog";
import Categories from "./pages/Categories";
import FileDetail from "./pages/FileDetail";
import AuthorWorks from "./pages/AuthorWorks";
import ShareView from "./pages/ShareView";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLibrary from "./pages/admin/AdminLibrary";
import AdminCategories from "./pages/admin/AdminCategories";

export default function App() {
  return (
    <Layout>
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
        <Route path="*" element={<div className="py-12 text-center text-navy-700">ไม่พบหน้านี้</div>} />
      </Routes>
    </Layout>
  );
}
