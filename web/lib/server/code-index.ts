import "server-only";
import {
  REFERENCE_CAP,
  type OutlineResponse,
  type SearchResponse,
  type SourcePosition,
  type SymbolAtPositionResponse,
  type SymbolInfo,
} from "@/lib/api-types";
import { getPool } from "@/lib/server/db";

const SEARCH_CAP = 200;
const SEARCH_LINE_CHARS = 1000;

/** A Postgres regex for the line endings Monaco counts, so line numbers agree with the viewer. */
export const LINE_BREAK_PATTERN = "\\r\\n|\\r|\\n";

async function findFileId(snapshotId: number, path: string): Promise<string | null> {
  const { rows } = await getPool().query<{ id: string }>(
    "select id from files where snapshot_id = $1 and path = $2",
    [snapshotId, path],
  );
  return rows[0]?.id ?? null;
}

interface SymbolRow {
  id: string;
  symbol_id: string;
  name: string;
  kind: string;
  path: string;
  start_line: number;
  end_line: number;
}

function toSymbolInfo(row: SymbolRow): SymbolInfo {
  return {
    symbolId: row.symbol_id,
    name: row.name,
    kind: row.kind,
    file: row.path,
    startLine: row.start_line,
    endLine: row.end_line,
  };
}

async function occurrencePositions(
  symbolPk: string,
  role: "definition" | "reference",
  limit: number,
): Promise<SourcePosition[]> {
  const { rows } = await getPool().query<{
    path: string;
    line: number;
    col: number;
    end_col: number;
  }>(
    `select f.path, o.line, o.col, o.end_col
       from occurrences o
       join files f on f.id = o.file_id
      where o.symbol_pk = $1 and o.role = $2
      order by f.path, o.line, o.col
      limit $3`,
    [symbolPk, role, limit],
  );
  return rows.map((row) => ({
    file: row.path,
    line: row.line,
    col: row.col,
    endCol: row.end_col,
  }));
}

/** Null when the snapshot has no such file. */
export async function symbolAtPosition(
  snapshotId: number,
  file: string,
  line: number,
  col: number,
): Promise<SymbolAtPositionResponse | null> {
  const fileId = await findFileId(snapshotId, file);
  if (!fileId) return null;
  // end_col is exclusive. If occurrences overlap, the narrowest is what the cursor is on.
  const { rows } = await getPool().query<SymbolRow>(
    `select s.id, s.symbol_id, s.name, s.kind, f.path, s.start_line, s.end_line
       from occurrences o
       join symbols s on s.id = o.symbol_pk
       join files f on f.id = s.file_id
      where o.file_id = $1 and o.line = $2 and o.col <= $3 and $3 < o.end_col
      order by o.end_col - o.col, case o.role when 'definition' then 0 else 1 end, s.id
      limit 1`,
    [fileId, line, col],
  );
  const symbol = rows[0];
  if (!symbol) return { symbol: null, definition: null, references: [], referencesTruncated: false };
  // One past the cap tells whether there are more, as search does.
  const [definitions, references] = await Promise.all([
    occurrencePositions(symbol.id, "definition", 1),
    occurrencePositions(symbol.id, "reference", REFERENCE_CAP + 1),
  ]);
  return {
    symbol: toSymbolInfo(symbol),
    definition: definitions[0] ?? null,
    references: references.slice(0, REFERENCE_CAP),
    referencesTruncated: references.length > REFERENCE_CAP,
  };
}

/** Null when the snapshot has no such file. */
export async function fileOutline(snapshotId: number, file: string): Promise<OutlineResponse | null> {
  const fileId = await findFileId(snapshotId, file);
  if (!fileId) return null;
  const { rows } = await getPool().query<SymbolRow>(
    `select s.id, s.symbol_id, s.name, s.kind, f.path, s.start_line, s.end_line
       from symbols s
       join files f on f.id = s.file_id
      where s.file_id = $1
      order by s.start_line, s.symbol_id`,
    [fileId],
  );
  return { symbols: rows.map(toSymbolInfo) };
}

function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

/** Null when there's no such snapshot. */
export async function searchSnapshot(snapshotId: number, query: string): Promise<SearchResponse | null> {
  const pool = getPool();
  const snapshot = await pool.query("select 1 from snapshots where id = $1", [snapshotId]);
  if (snapshot.rowCount === 0) return null;
  const pattern = `%${escapeLikePattern(query)}%`;
  // The file-level ILIKE finds candidates in SQL, and lines are split and matched inside Postgres,
  // so no file's content comes back here. Only the matching lines do, cut short in case of minified
  // files. One row past the cap tells us the results were truncated. The ILIKE can use the trigram
  // index, but the planner often prefers scanning one snapshot's files. Measured at 24,000 files
  // that was the better choice, so don't force it.
  const { rows } = await pool.query<{ path: string; line: number; text: string }>(
    `select f.path, l.line_number::int as line, left(l.text, $4) as text
       from files f
       cross join lateral regexp_split_to_table(f.content, $5)
         with ordinality as l (text, line_number)
      where f.snapshot_id = $1
        and f.content ilike $2 escape '\\'
        and l.text ilike $2 escape '\\'
      order by f.path, l.line_number
      limit $3`,
    [snapshotId, pattern, SEARCH_CAP + 1, SEARCH_LINE_CHARS, LINE_BREAK_PATTERN],
  );
  return {
    matches: rows
      .slice(0, SEARCH_CAP)
      .map((row) => ({ file: row.path, line: row.line, text: row.text })),
    truncated: rows.length > SEARCH_CAP,
  };
}
