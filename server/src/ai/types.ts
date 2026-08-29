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

export interface AiAdapter {
  /** Answers a question using ONLY the given context — must decline (not fabricate) when the context doesn't cover it. */
  answerFromContext(question: string, context: string, options?: AnswerOptions): Promise<string>;
}
