const BASE_SYSTEM_PROMPT = `You are an agent with tool access.
Rules:
- Use tools only when needed to complete the user's request.
- Do not repeat the same tool call with identical arguments unless the previous call clearly failed due to a transient error.`;

export function buildSystemPrompt(): string {
    return `${BASE_SYSTEM_PROMPT}\n- When the task is complete, call the finish_task tool exactly once with a short final summary in message.`;
}
