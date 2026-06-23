import { z } from "zod";

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
              functionCall: {
                  name: string;
                  args: Record<string, unknown>;
              };
          }
        | {
              functionResponse: {
                  name: string;
                  response: Record<string, unknown>;
              };
          }
    >;
};

export const ModelOutputSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("TOOL_REQUEST"),
        tool: z.string().min(1),
        args: z.record(z.string(), z.unknown()).default({}),
    }),
    z.object({
        kind: z.literal("TEXT_RESPONSE"),
        message: z.string().min(1),
    }),
    z.object({
        kind: z.literal("END"),
        message: z.string().min(1).optional(),
    }),
]);
export type { State, NormalizedResponse, Conversation };
