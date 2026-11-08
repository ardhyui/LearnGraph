/**
 * Roadmap M5 ("PDF dan Word"): the curriculum page reads the text of a Word
 * file in the browser. A .docx is a ZIP archive; these tests build real ones
 * in memory (deflated and stored) and check what comes out, and that other
 * files are refused with a readable message.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocxError, MAX_DOCX_XML_BYTES, docxText, documentXmlToText } from '../src/lib/ai/docx-text.ts';
import { documentXml, makeDocx, zip } from './support/docx.ts';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Statistics 101</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Week 1: averages </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>&amp; spread</w:t></w:r></w:p>
<w:p/>
<w:p/>
<w:p><w:r><w:t>Unit</w:t><w:tab/><w:t>Probability &lt;basic&gt;</w:t><w:br/><w:t>then &#x201C;tests&#x201D;</w:t></w:r></w:p>
<w:p><w:del><w:r><w:delText>removed draft text</w:delText></w:r></w:del><w:r><w:t>Final week: review</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;
const EXPECTED = 'Statistics 101\nWeek 1: averages & spread\n\nUnit\tProbability <basic>\nthen “tests”\nFinal week: review\nCell';

describe('Word (.docx) text for curriculum drafts', () => {
  it('reads paragraphs, tabs, line breaks and entities from a deflated document', async () => {
    const file = zip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/styles.xml', data: '<w:styles/>' },
      { name: 'word/document.xml', data: DOCUMENT },
    ]);
    assert.equal(await docxText(file), EXPECTED);
  });

  it('reads a stored (uncompressed) entry too', async () => {
    assert.equal(await docxText(zip([{ name: 'word/document.xml', data: DOCUMENT, store: true }])), EXPECTED);
  });

  it('leaves out paragraph settings (tab stops) and deleted text', () => {
    const text = documentXmlToText(DOCUMENT);
    assert.ok(!text.includes('removed draft text'));
    assert.ok(text.startsWith('Statistics 101\n'), 'no tab from the tab-stop list');
  });

  it('refuses files that are not .docx, with a readable message', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\n' + 'x'.repeat(100));
    await assert.rejects(docxText(pdf), (err) => err instanceof DocxError && /not a Word \(\.docx\) file/.test(err.message));
    await assert.rejects(docxText(new Uint8Array(4)), DocxError);
    const otherZip = zip([{ name: 'content.xml', data: '<office:document/>' }]);
    await assert.rejects(docxText(otherZip), (err) => err instanceof DocxError && /not a Word/.test(err.message));
  });

  it('refuses a document that would inflate beyond the limit', async () => {
    const bomb = zip([{ name: 'word/document.xml', data: '<w:p/>', declaredSize: MAX_DOCX_XML_BYTES + 1 }]);
    await assert.rejects(docxText(bomb), (err) => err instanceof DocxError && /too large/.test(err.message));
    // Declared small, but inflates to more than the limit: stopped while inflating.
    const sneaky = zip([{ name: 'word/document.xml', data: new Uint8Array(MAX_DOCX_XML_BYTES + 1024), declaredSize: 10 }]);
    await assert.rejects(docxText(sneaky), (err) => err instanceof DocxError && /too large/.test(err.message));
  });

  it('round-trips the helper the smoke test uploads', async () => {
    const paragraphs = ['Statistics 101', '', 'Averages & spread <week 1>', 'Probability'];
    assert.equal(documentXmlToText(documentXml(paragraphs)), 'Statistics 101\n\nAverages & spread <week 1>\nProbability');
    assert.equal(await docxText(makeDocx(paragraphs)), 'Statistics 101\n\nAverages & spread <week 1>\nProbability');
  });

  it('reports a damaged document instead of throwing a stream error', async () => {
    const damaged = zip([{ name: 'word/document.xml', data: new Uint8Array([0xff, 0xff, 0xff, 0xff]), store: true }]);
    // Mark the stored bytes as deflated so inflating them fails.
    damaged[8] = 8;
    const cd = damaged.length - 22 - (46 + 'word/document.xml'.length);
    damaged[cd + 10] = 8;
    await assert.rejects(docxText(damaged), (err) => err instanceof DocxError && /damaged/.test(err.message));
  });
});
