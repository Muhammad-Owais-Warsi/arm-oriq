type State =
    | { kind: "START"; cycle: number }
    | { kind: "TEXT_RESPONSE"; cycle: number; message: string }
    | {
          kind: "TOOL_REQUEST";
          cycle: number;
          tool: string;
          args: Record<string, unknown>;
      }
    | { kind: "TOOL_OUTPUT"; cycle: number; results: unknown }
    | { kind: "END"; cycle: number; message?: string }
    | { kind: "FAILED"; cycle: number; message: string };

type NormalizedResponse =
    | { kind: "TOOL_REQUEST"; tool: string; args: Record<string, unknown> }
    | { kind: "TEXT_RESPONSE"; message: string }
    | { kind: "END"; message?: string }
    | { kind: "FAILED"; message: string };

type Conversation = {
    role: "user" | "model";
    parts: Array<
        | { text: string }
        | {
              functionResponse: {
                  name: string;
                  response: Record<string, unknown>;
              };
          }
    >;
};

export type { State, NormalizedResponse, Conversation };
