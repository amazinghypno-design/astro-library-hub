import SubjectCards from "../components/SubjectCards";

/**
 * Every หมวดใหญ่ on one page — the map of what is kept here.
 * Same cards as the homepage, without anything else competing for attention.
 */
export default function Subjects() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">หมวดใหญ่</h1>
        <p className="text-navy-700/70 mt-1">แต่ละหมวดคือหนึ่งศาสตร์ มีวิชา ตำรา โน้ต และสกิลของตัวเอง ไม่ปนกัน</p>
      </div>
      <SubjectCards />
    </div>
  );
}
