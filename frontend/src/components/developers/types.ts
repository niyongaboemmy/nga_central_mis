/**
 * Shapes of the developer documentation (content.ts). The page is data-driven:
 * to document a new endpoint, add an entry to content.ts -- no layout work.
 */

export type Lang = "curl" | "node" | "python" | "php" | "browser" | "json" | "http" | "env" | "text";

export interface Sample {
  lang: Lang;
  /** Tab label when it should differ from the language name. */
  label?: string;
  /**
   * The code. {{BASE}}, {{LOGIN}}, {{CLIENT_ID}}, {{REDIRECT_URI}} and {{TENANT}}
   * are replaced with the reader's own values (DevelopersPage "Your values").
   */
  code: string;
}

export type Method = "GET" | "POST" | "PUT" | "DELETE";

export interface Param {
  name: string;
  in: "query" | "body" | "header" | "path";
  type: string;
  required?: boolean;
  /** Inline `code` and **bold** are rendered. */
  description: string;
}

export interface ErrorRow {
  status: number;
  /** The `code` field when the response carries one. */
  code?: string;
  meaning: string;
}

export interface Endpoint {
  /** Anchor id, unique across the page. */
  id: string;
  method: Method;
  path: string;
  summary: string;
  /** Who may call it, in a few words. */
  auth: string;
  description?: string;
  params?: Param[];
  samples: Sample[];
  response?: { status: number; body: string };
  errors?: ErrorRow[];
}

export type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; ordered?: boolean; items: string[] }
  | { kind: "note"; tone: "info" | "warn"; title?: string; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "steps"; steps: Array<{ title: string; text: string }> }
  | { kind: "code"; title?: string; samples: Sample[] }
  | { kind: "endpoint"; endpoint: Endpoint };

export interface Section {
  id: string;
  title: string;
  /** One line under the title. */
  lead?: string;
  /** Extra words the search should match. */
  keywords?: string;
  blocks: Block[];
}

export interface Group {
  title: string;
  sections: Section[];
}
