// Table data extraction from the markdown AST (dependency-free,
// bun-testable). Pure functions only: nothing here may mutate render
// state, because table rules run inside React's render pass (and the
// React Compiler assumes purity there).

interface AstNode {
  type?: string;
  content?: unknown;
  children?: AstNode[];
}

function nodeText(node: AstNode | null | undefined): string {
  if (!node) {
    return "";
  }

  // Container nodes (table/tr/td/...) carry content: "" — only leaf text
  // nodes have real content, so empty strings must fall through to children.
  if (typeof node.content === "string" && node.content !== "") {
    return node.content;
  }

  if (Array.isArray(node.children)) {
    return node.children.map(nodeText).join("");
  }

  return "";
}

/** Rows of [header..., ...body] as plain strings, [] when not a table. */
export function extractTableData(node: AstNode | null | undefined): string[][] {
  const rows: string[][] = [];

  const walk = (n: AstNode | null | undefined): void => {
    if (!n) {
      return;
    }

    if (n.type === "tr") {
      const cells = (n.children ?? []).filter(
        (c) => c.type === "th" || c.type === "td",
      );
      rows.push(cells.map((c) => nodeText(c).trim()));
    } else if (Array.isArray(n.children)) {
      n.children.forEach(walk);
    }
  };

  walk(node);

  return rows;
}

function csvCell(cell: string): string {
  if (/[",\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }

  return cell;
}

export function tableToTsv(rows: string[][]): string {
  const flat = (cell: string): string => cell.replace(/[\r\n]+/g, " ");

  return rows.map((r) => r.map(flat).join("\t")).join("\n");
}

export function tableToCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}
