export interface AnswerOptions {
  /**
   * Replaces the adapter's default instructions. The default answers as a
   * librarian about one book; the notes feature answers as the owner's own
   * assistant about their own writing, which is a different job with a
   * different decline message — but the same "only from this context" rule.
   */
  systemPrompt?: string;
  maxTokens?: number;
}

export interface TransformOptions {
  maxTokens?: number;
  /** Defaults to 0 — transforming text is not a place for invention. */
  temperature?: number;
}

export interface AiAdapter {
  /** Answers a question using ONLY the given context — must decline (not fabricate) when the context doesn't cover it. */
  answerFromContext(question: string, context: string, options?: AnswerOptions): Promise<string>;
  /**
   * One instruction-following turn whose entire output *is* the result, for
   * work where the model is transforming text rather than answering about it
   * — proofreading, for instance. Kept separate from `answerFromContext`
   * because that one wraps its input in "here is a book, here is a question",
   * which is the wrong frame for a job with no question in it.
   */
  transform(systemPrompt: string, content: string, options?: TransformOptions): Promise<string>;
}
