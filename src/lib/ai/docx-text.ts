/**
 * Plain text from a Word (.docx) file, for the curriculum draft (Roadmap M5:
 * "PDF dan Word"). Runs in the browser, so the person sees and can edit the
 * text before anything is sent. No dependency: a .docx is a ZIP archive whose
 * body is `word/document.xml`; the ZIP directory is read by hand and the entry
 * is inflated with the platform's `DecompressionStream` (browsers, Node 18+).
 * Old binary .doc files and ZIP64 archives are not supported.
 */

export class DocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxError';
  }
}

/** Larger bodies are refused before and while inflating (guards against ZIP bombs). */
export const MAX_DOCX_XML_BYTES = 20 * 1024 * 1024;

const NOT_DOCX = 'This is not a Word (.docx) file. Save it as .docx, or as PDF.';

export async function docxText(bytes: Uint8Array): Promise<string> {
  const xml = await readZipEntry(bytes, 'word/document.xml');
  return documentXmlToText(new TextDecoder().decode(xml));
}

async function readZipEntry(bytes: Uint8Array, name: string): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  if (bytes.length < 22) throw new DocxError(NOT_DOCX);

  // End of central directory: the last 22 bytes, plus up to 64 KB of comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DocxError(NOT_DOCX);
  const entries = u16(eocd + 10);
  let at = u32(eocd + 16);

  const wanted = new TextEncoder().encode(name);
  for (let n = 0; n < entries; n++) {
    if (at + 46 > bytes.length || u32(at) !== 0x02014b50) break;
    const method = u16(at + 10);
    const compressedSize = u32(at + 20);
    const size = u32(at + 24);
    const nameLength = u16(at + 28);
    const localHeader = u32(at + 42);
    const entryName = bytes.subarray(at + 46, at + 46 + nameLength);
    at += 46 + nameLength + u16(at + 30) + u16(at + 32);
    if (entryName.length !== wanted.length || !entryName.every((b, i) => b === wanted[i])) continue;

    if (size > MAX_DOCX_XML_BYTES || compressedSize === 0xffffffff) throw new DocxError('This Word file is too large to read.');
    if (localHeader + 30 > bytes.length || u32(localHeader) !== 0x04034b50) throw new DocxError(NOT_DOCX);
    const start = localHeader + 30 + u16(localHeader + 26) + u16(localHeader + 28);
    const data = bytes.subarray(start, start + compressedSize);
    if (data.length !== compressedSize) throw new DocxError(NOT_DOCX);
    if (method === 0) return data;
    if (method === 8) return inflateRaw(data);
    throw new DocxError('This Word file uses a compression LearnGraph cannot read. Save it again, or as PDF.');
  }
  throw new DocxError(NOT_DOCX);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_DOCX_XML_BYTES) {
        await reader.cancel();
        throw new DocxError('This Word file is too large to read.');
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof DocxError) throw err;
    throw new DocxError('This Word file looks damaged. Save it again, or as PDF.');
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, ref: string) => {
    if (ref[0] !== '#') return ENTITIES[ref.toLowerCase()] ?? whole;
    const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/**
 * The text of a WordprocessingML body: one line per paragraph, tabs and line
 * breaks kept. Paragraph settings (which list tab stops) and deleted text in
 * tracked changes (`w:delText`) are left out.
 */
export function documentXmlToText(xml: string): string {
  const body = xml.replace(/<w:pPr\b[^>]*\/>|<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/g, '');
  let out = '';
  // A paragraph ends with </w:p>; an empty one is written <w:p/> (a blank line).
  for (const m of body.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>|<\/w:p>|<w:p(?:\s[^>]*)?\/>/g)) {
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (m[0].startsWith('<w:tab')) out += '\t';
    else out += '\n';
  }
  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
