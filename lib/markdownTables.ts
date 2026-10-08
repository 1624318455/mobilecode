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

function splitPipeRow(line: string): string[] {
  const kept: string[] = [];
  let current = "";
  let escaped = false;

  for (const ch of line) {
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (ch === "\\") {
      current += ch;
      escaped = true;
    } else if (ch === "|") {
      kept.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  kept.push(current);
  // Drop the empty segments outside the outer pipes.
  if (kept.length > 0 && kept[0]?.trim() === "") {
    kept.shift();
  }

  if (kept.length > 0 && kept[kept.length - 1]?.trim() === "") {
    kept.pop();
  }

  return kept;
}

function isSeparatorRow(line: string): boolean {
  const cells = splitPipeRow(line);

  return (
    cells.length > 0 &&
    cells.every((c) => /^:?-+:?$/.test(c.trim()))
  );
}

function padBlock(block: string[], width: number): string[] {
  return block.map((line) => {
    const cells = splitPipeRow(line);

    if (cells.length >= width) {
      return line;
    }

    if (isSeparatorRow(line)) {
      return `|${[...cells.map((c) => c.trim() || "---"), ...Array<string>(width - cells.length).fill("---")].join("|")}|`;
    }

    return `|${[...cells, ...Array<string>(width - cells.length).fill("")].join("|")}|`;
  });
}

/**
 * Pad ragged markdown table rows (AI output often drops trailing pipes)
 * so every row carries the header's cell count. Without this, flex cells
 * divide each short row among fewer items and columns visibly misalign
 * no matter what the cell styles do. Code fences are left untouched.
 */
export function padTableRows(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let block: string[] = [];
  let fence = false;

  function flush(): void {
    if (block.length >= 2) {
      const width = splitPipeRow(block[0] ?? "").length;

      if (width > 0 && block.some((l) => isSeparatorRow(l))) {
        out.push(...padBlock(block, width));
        block = [];

        return;
      }
    }

    out.push(...block);
    block = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^(```|~~~)/.test(trimmed)) {
      flush();
      fence = !fence;
      out.push(line);
      continue;
    }

    if (!fence && /^\|/.test(line)) {
      block.push(line);
      continue;
    }

    flush();
    out.push(line);
  }

  flush();

  return out.join("\n");
}
