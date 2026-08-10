'use strict';

const docx = require('docx');
const PDFDocument = require('pdfkit');

function splitDocLines(text) {
  return String(text || '').split(/\r\n|\n|\r/);
}

/**
 * pdfkit ning standart shriftlari (Helvetica) WinAnsi kodlashdan foydalanadi —
 * emoji va lotin bo'lmagan belgilar buzilgan holda chiqadi yoki xato beradi.
 * Shuning uchun PDF ga yozishdan oldin matn tozalanadi.
 */
function pdfSafe(text) {
  return String(text || '')
    .replace(/[‘’ʻʼ]/g, "'")   // o‘zbekcha tutuq belgilari
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\xFF\n\r\t]/g, '');            // emoji va qolgan belgilarni olib tashlash
}

/**
 * Export 7 documents to a single Word (.docx) file
 */
function exportWord(req, res) {
  const { title, docs, content } = req.body;
  if (!docs && !content) return res.status(400).json({ error: 'No content' });

  const { Document, Packer, Paragraph, TextRun } = docx;
  let children = [];

  if (docs && Object.keys(docs).length > 0) {
    const docOrder = ['ariza', 'kafolat', 'kompaniya', 'texnik', 'narx', 'moliya', 'vakolat'];
    const docNames = {
      ariza: '📋 ARIZA (Shakl №1)',
      kafolat: '🛡️ KAFOLAT XATI (Shakl №2)',
      kompaniya: '🏢 KOMPANIYA MA\'LUMOTLARI (Shakl №3)',
      texnik: '⚙️ TEXNIK TAKLIF (Shakl №6)',
      narx: '💰 NARX TAKLIFI (Shakl №7)',
      moliya: '📊 MOLIYAVIY HOLAT',
      vakolat: '📝 VAKOLATNOMA (Shakl №5)'
    };

    docOrder.forEach((docType, idx) => {
      if (docs[docType]) {
        if (idx > 0) {
          children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
        }

        children.push(new Paragraph({
          children: [new TextRun({ text: docNames[docType] || docType, bold: true, size: 28, font: 'Cambria', color: '1F2937' })],
          spacing: { after: 200 }
        }));

        const lines = splitDocLines(docs[docType]);
        lines.forEach(line => {
          children.push(new Paragraph({
            children: [new TextRun({ text: line || ' ', size: 22, font: 'Cambria' })],
            spacing: { after: 80 }
          }));
        });
      }
    });
  } else if (content) {
    const paragraphs = splitDocLines(content).map(line => {
      return new Paragraph({
        children: [new TextRun({ text: line, size: 24, font: 'Cambria' })],
        spacing: { after: 120 }
      });
    });
    children = paragraphs;
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: title || 'Tender Hujjatlari', bold: true, size: 36, font: 'Cambria' })],
          spacing: { after: 400 }
        }),
        new Paragraph({
          children: [new TextRun({ text: 'O\'zbekiston davlat xaridlari standartiga mos', italic: true, size: 20, font: 'Cambria' })],
          spacing: { after: 600 }
        }),
        ...children
      ],
    }],
  });

  Packer.toBuffer(doc).then((buffer) => {
    res.setHeader('Content-Disposition', `attachment; filename="${(title || 'Hujjat').replace(/\s+/g, '_')}.docx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  }).catch(e => res.status(500).json({ error: e.message }));
}

/**
 * Export 7 documents to a single PDF (.pdf) file
 */
function exportPdf(req, res) {
  const { title, docs, content } = req.body;
  if (!docs && !content) return res.status(400).send('No content');

  const pdf = new PDFDocument({ margin: 40, bufferPages: true });

  res.setHeader('Content-Disposition', `attachment; filename="${(title || 'Hujjat').replace(/\s+/g, '_')}.pdf"`);
  res.setHeader('Content-Type', 'application/pdf');

  // Oqim boshlanganidan keyin xato chiqsa, header allaqachon yuborilgan bo'ladi —
  // ulanishni yopishdan boshqa iloj yo'q, lekin jimgina osilib qolmasin.
  pdf.on('error', () => res.end());

  pdf.pipe(res);

  if (docs && Object.keys(docs).length > 0) {
    const docOrder = ['ariza', 'kafolat', 'kompaniya', 'texnik', 'narx', 'moliya', 'vakolat'];
    const docNames = {
      ariza: 'ARIZA (Shakl N1)',
      kafolat: 'KAFOLAT XATI (Shakl N2)',
      kompaniya: 'KOMPANIYA MA\'LUMOTLARI (Shakl N3)',
      texnik: 'TEXNIK TAKLIF (Shakl N6)',
      narx: 'NARX TAKLIFI (Shakl N7)',
      moliya: 'MOLIYAVIY HOLAT',
      vakolat: 'VAKOLATNOMA (Shakl N5)'
    };

    pdf.fontSize(24).font('Helvetica-Bold').text(pdfSafe(title || 'Tender Hujjatlari'), { align: 'center' }).moveDown(1);
    pdf.fontSize(12).font('Helvetica-Oblique').text('O\'zbekiston davlat xaridlari standartiga mos', { align: 'center' }).moveDown(3);

    docOrder.forEach((docType, idx) => {
      if (docs[docType]) {
        if (idx > 0) {
          pdf.addPage();
        }

        pdf.fontSize(14).font('Helvetica-Bold').text(docNames[docType] || docType).moveDown(1);
        pdf.moveTo(40, pdf.y).lineTo(550, pdf.y).stroke().moveDown(0.5);

        pdf.fontSize(10).font('Helvetica');
        const lines = splitDocLines(docs[docType]);
        lines.forEach(line => {
          pdf.text(pdfSafe(line), { align: 'justify', lineGap: 2 });
        });
        pdf.moveDown(1);
      }
    });
  } else if (content) {
    pdf.fontSize(18).text(pdfSafe(title || 'Tender Hujjati'), { align: 'center' }).moveDown(2);
    pdf.fontSize(12).text(pdfSafe(content), { align: 'justify', lineGap: 4 });
  }

  pdf.end();
}

module.exports = {
  exportWord,
  exportPdf
};
