import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toThaiErrorMessage } from "../lib/errorMessages";

interface ChatTurn {
  question: string;
  answer: string | null;
  error: string | null;
}

export default function BookChatPanel({ fileId, canAsk }: { fileId: string; canAsk: boolean }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const askBook = trpc.library.askBook.useMutation();

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || askBook.isLoading) return;
    setQuestion("");
    setTurns((t) => [...t, { question: q, answer: null, error: null }]);

    try {
      const result = await askBook.mutateAsync({ id: fileId, question: q });
      const answer = result.status === "NO_TEXT" ? "เล่มนี้ยังไม่รองรับระบบถามตอบอัตโนมัติ" : (result.answer ?? "ไม่พบข้อมูลนี้ในเล่มนี้");
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = { question: q, answer, error: null };
        return copy;
      });
    } catch (err) {
      const message = toThaiErrorMessage(err, "ถามไม่สำเร็จ ลองอีกครั้งนะครับ");
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = { question: q, answer: null, error: message };
        return copy;
      });
    }
  }

  if (!canAsk) {
    return (
      <div className="card p-5">
        <h2 className="font-serif text-lg font-semibold text-navy-900 mb-1">ถามหนังสือเล่มนี้</h2>
        <p className="text-sm text-navy-700/60">เล่มนี้ยังไม่รองรับระบบถามตอบอัตโนมัติ</p>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="font-serif text-lg font-semibold text-navy-900">ถามหนังสือเล่มนี้</h2>
        <p className="text-sm text-navy-700/55 mt-0.5">พิมพ์คำถามเกี่ยวกับเนื้อหาในเล่มนี้ — ระบบจะตอบจากเนื้อหาจริงในเล่มเท่านั้น</p>
      </div>

      {turns.length > 0 && (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <div className="text-sm font-medium text-navy-900 bg-navy-900/[0.04] rounded-xl px-3 py-2">{t.question}</div>
              {t.answer != null && (
                <div className="text-sm text-navy-800 bg-gold-400/[0.08] border border-gold-400/20 rounded-xl px-3 py-2">{t.answer}</div>
              )}
              {t.error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{t.error}</div>}
              {t.answer == null && !t.error && (
                <div className="text-sm text-navy-700/50 px-3 py-2 flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse" />
                  กำลังค้นในเล่ม...
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={onAsk} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="เช่น หนังสือเล่มนี้พูดถึงอะไรบ้าง?"
          className="input-field flex-1"
        />
        <button type="submit" disabled={!question.trim() || askBook.isLoading} className="btn-gold whitespace-nowrap">
          ถาม
        </button>
      </form>
    </div>
  );
}
