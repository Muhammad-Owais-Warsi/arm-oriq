export type Tool = {
    declaration: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
    func: (args: Record<string, unknown>) => Promise<unknown>;
};
