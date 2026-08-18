export interface AiAdapter {
  /** Answers a question using ONLY the given context — must decline (not fabricate) when the context doesn't cover it. */
  answerFromContext(question: string, context: string): Promise<string>;
}
