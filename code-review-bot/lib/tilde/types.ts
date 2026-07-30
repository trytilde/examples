export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export type TildeConfig = {
  apiKey: string;
  baseUrl: string;
  orgId: string;
  teamId: string;
};
