import { useRef, useState } from "react";
import { trpc } from "../lib/trpc";

interface Exchange {
  question: string;
  answer: string;
}

/**
 * "ถาม AI จากโน้ตของฉัน" — the reason for keeping this writing here instead of
 * in Notion: an assistant that has read all of it.
 *
 * Answers come only from the owner's own notes and skills (see
 * server/src/routers/notes.ts `ask`), so the failure mode is a plain "it isn't
 * written down yet" rather than a confident answer invented out of the
 * model's general knowledge. The exchange lives in component state only — a
 * question is a way of reading the notebook, not another thing to store in
 * it.
 */
export default function KnowledgeChatPanel({ tag, subject }: { tag?: string; subject?: string }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ask = trpc.notes.ask.useMutation({
    onSuccess: (result, variables) => {
      if (result.status === "NO_KNOWLEDGE") {
        setError("ยังไม่มีเนื้อหาในโน้ตให้ AI อ่าน — ลองเขียนโน้ตสักหน้าก่อน");
        return;
      }
      setHistory((prev) => [...prev, { question: variables.question, answer: result.answer ?? "" }]);
      setQuestion("");
      inputRef.current?.focus();
    },
    onError: () => setError("ถาม AI ไม่สำเร็จ ลองใหม่อีกครั้ง"),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    setError(null);
    ask.mutate({ question: trimmed, tag, subject });
  }

  return (
    <section className="card p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="font-serif text-lg font-semibold text-navy-900">ถาม AI จากโน้ตของฉัน</h2>
        <p className="text-sm text-navy-700/70">
          ตอบจากโน้ตและสกิลที่คุณเขียนไว้เท่านั้น{tag ? ` (เฉพาะแท็ก "${tag}")` : ""} — ไม่เดาเอง
        </p>
      </div>

      {history.length > 0 && (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {history.map((item, index) => (
            <div key={index} className="space-y-1.5">
              <p className="text-sm font-medium text-navy-900">{item.question}</p>
              <p className="text-sm text-navy-800 whitespace-pre-wrap bg-gold-400/[0.07] border border-gold-500/20 rounded-xl px-3 py-2">
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="เช่น สรุปสกิลของฉันให้หน่อย"
          className="input-field py-2 text-sm"
          maxLength={500}
        />
        <button type="submit" disabled={ask.isLoading || !question.trim()} className="btn-gold py-2 px-4 text-sm shrink-0">
          {ask.isLoading ? "กำลังคิด…" : "ถาม"}
        </button>
      </form>

      {error && <p className="text-red-700 text-sm">{error}</p>}
    </section>
  );
}
