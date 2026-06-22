const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, BorderStyle, WidthType, ExternalHyperlink
} = require('docx');
const fs = require('fs');

const data = JSON.parse(process.argv[2]);
const profile = data.profile;
const tailored = data.tailored || {};
const outputPath = data.outputPath;

const summary = tailored.tailoredSummary || profile.summary || "";
const skillCategories = tailored.reorderedSkillCategories || profile.skillCategories || [];
const projects = tailored.reorderedProjects || profile.projects || [];
const experience = tailored.reorderedExperience || profile.experience || [];
const education = profile.education || [];

// Colours matching original CV
const NAVY = "1F3A5F";       // navy blue — name, section headings underline
const BRIGHT_BLUE = "2E74B5"; // bright blue — section heading text
const BLACK = "000000";       // black — body text, bullets
const DARK_GRAY = "404040";   // dates, secondary info

const PAGE_W = 9360;

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

const numbering = {
  config: [{
    reference: "bullets",
    levels: [{
      level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360, hanging: 180 } } }
    }]
  }]
};

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [new TextRun({ text, font: "Calibri", size: 20, color: BLACK })],
    spacing: { before: 20, after: 20 }
  });
}

function sectionDivider(title) {
  return new Paragraph({
    children: [new TextRun({ text: title, bold: true, font: "Calibri", size: 22, color: BRIGHT_BLUE })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 1 } },
    spacing: { before: 180, after: 80 }
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Calibri", size: 20, color: BLACK, ...opts })],
    spacing: { before: opts.spaceBefore || 0, after: opts.spaceAfter || 40 },
    alignment: opts.alignment
  });
}

function roleHeader(left, right) {
  return new Paragraph({
    tabStops: [{ type: "right", position: PAGE_W }],
    children: [
      new TextRun({ text: left, bold: true, font: "Calibri", size: 20, color: BLACK }),
      new TextRun({ text: "\t" + right, font: "Calibri", size: 20, color: DARK_GRAY })
    ],
    spacing: { before: 100, after: 40 }
  });
}

const children = [];

// NAME — navy blue, bold, centred
children.push(new Paragraph({
  children: [new TextRun({ text: profile.name, bold: true, font: "Calibri", size: 40, color: NAVY })],
  alignment: AlignmentType.CENTER,
  spacing: { before: 0, after: 60 }
}));

// CONTACT LINE — dark gray, centred, LinkedIn as hyperlink
const nonLinkedIn = [profile.location, profile.email, profile.phone].filter(Boolean);
const linkedInUrl = profile.linkedin
  ? (profile.linkedin.startsWith("http") ? profile.linkedin : `https://${profile.linkedin}`)
  : null;

const contactChildren = [];
nonLinkedIn.forEach((part, i) => {
  contactChildren.push(new TextRun({ text: part, font: "Calibri", size: 18, color: DARK_GRAY }));
  if (i < nonLinkedIn.length - 1 || linkedInUrl) {
    contactChildren.push(new TextRun({ text: "  |  ", font: "Calibri", size: 18, color: DARK_GRAY }));
  }
});
if (linkedInUrl) {
  contactChildren.push(new ExternalHyperlink({
    link: linkedInUrl,
    children: [new TextRun({ text: profile.linkedin, font: "Calibri", size: 18, color: BRIGHT_BLUE, underline: { type: "single", color: BRIGHT_BLUE } })]
  }));
}

children.push(new Paragraph({
  children: contactChildren,
  alignment: AlignmentType.CENTER,
  spacing: { before: 0, after: 40 }
}));

// PROFILE
if (summary) {
  children.push(sectionDivider("PROFILE"));
  children.push(para(summary, { spaceAfter: 60 }));
}

// TECHNICAL SKILLS — borderless table
if (skillCategories.length > 0) {
  children.push(sectionDivider("TECHNICAL SKILLS"));
  const skillRows = skillCategories.map(cat => new TableRow({
    children: [
      new TableCell({
        borders: noBorders,
        width: { size: 2400, type: WidthType.DXA },
        margins: { top: 40, bottom: 40, left: 0, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text: cat.category, bold: true, font: "Calibri", size: 20, color: BLACK })]
        })]
      }),
      new TableCell({
        borders: noBorders,
        width: { size: PAGE_W - 2400, type: WidthType.DXA },
        margins: { top: 40, bottom: 40, left: 0, right: 0 },
        children: [new Paragraph({
          children: [new TextRun({ text: (cat.skills || []).join(", "), font: "Calibri", size: 20, color: BLACK })]
        })]
      })
    ]
  }));
  children.push(new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [2400, PAGE_W - 2400],
    rows: skillRows
  }));
}

// KEY PROJECTS
if (projects.length > 0) {
  children.push(sectionDivider("KEY PROJECTS"));
  for (const proj of projects) {
    const dateStr = [proj.startDate, proj.endDate].filter(Boolean).join(" – ");
    const leftLabel = [proj.role, proj.name].filter(Boolean).join(" | ");
    children.push(roleHeader(leftLabel, dateStr));
    for (const b of (proj.tailoredBullets || proj.bullets || [])) {
      children.push(bullet(b));
    }
  }
}

// PROFESSIONAL EXPERIENCE
if (experience.length > 0) {
  children.push(sectionDivider("PROFESSIONAL EXPERIENCE"));
  for (const exp of experience) {
    const dateStr = [exp.startDate, exp.endDate].filter(Boolean).join(" – ");
    children.push(roleHeader(`${exp.role} | ${exp.company}`, dateStr));
    for (const b of (exp.tailoredBullets || exp.bullets || [])) {
      children.push(bullet(b));
    }
  }
}

// EDUCATION
if (education.length > 0) {
  children.push(sectionDivider("EDUCATION"));
  for (const ed of education) {
    const dateStr = [ed.startDate, ed.endDate].filter(Boolean).join(" – ");
    children.push(new Paragraph({
      tabStops: [{ type: "right", position: PAGE_W }],
      children: [
        new TextRun({ text: `${ed.degree} | ${ed.institution}`, bold: true, font: "Calibri", size: 20, color: BLACK }),
        new TextRun({ text: "\t" + dateStr, font: "Calibri", size: 20, color: DARK_GRAY })
      ],
      spacing: { before: 100, after: 40 }
    }));
    if (ed.extra) children.push(para(ed.extra, { color: DARK_GRAY, spaceAfter: 20 }));
    if (ed.notes) children.push(para(ed.notes, { color: DARK_GRAY, spaceAfter: 40 }));
  }
}

const doc = new Document({
  numbering,
  styles: { default: { document: { run: { font: "Calibri", size: 20, color: BLACK } } } },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
      }
    },
    children
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log("OK:" + outputPath);
}).catch(err => {
  console.error("ERR:" + err.message);
  process.exit(1);
});
