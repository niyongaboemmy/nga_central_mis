const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const mammoth = require("mammoth");

async function testExtraction(filename) {
  const filePath = path.join(__dirname, filename);
  const result = await mammoth.convertToHtml({
    buffer: fs.readFileSync(filePath),
  });
  const html = result.value;
  const $ = cheerio.load(html);
  const cleanText = (text) => text.trim().replace(/\s+/g, " ");

  const extracted = {
    outcomes: [],
    sections: [],
    indicativeContent: [],
    assignments: [],
    evaluation: {
      teacher_notes: "",
      references: "",
      prepared_by: "",
      verified_by: "",
    },
  };

  const cells = [];
  $("th, td").each((i, el) => {
    let cellHtml = $(el).html() || "";
    cellHtml = cellHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n</p>");
    const cellText = cheerio.load(cellHtml).text().trim();
    if (cellText) cells.push(cellText);
  });

  const findValue = (label) => {
    for (let i = 0; i < cells.length; i++) {
      const parts = cells[i].split(/[:：]/);
      if (
        parts.length > 1 &&
        parts[0].trim().toLowerCase() === label.toLowerCase()
      ) {
        return cleanText(parts.slice(1).join(":"));
      }
      if (
        cells[i].trim().toLowerCase() === label.toLowerCase() &&
        cells[i + 1]
      ) {
        if (!cells[i].includes(":")) return cleanText(cells[i + 1]);
      }
    }

    // Fallback: search anywhere in the cell text
    for (let i = 0; i < cells.length; i++) {
      const parts = cells[i].split(/[:：]/);
      if (
        parts.length > 1 &&
        parts[0].toLowerCase().includes(label.toLowerCase())
      ) {
        return cleanText(parts.slice(1).join(":"));
      }
    }

    return "";
  };

  extracted.sector = findValue("Sector") || findValue("Department");
  extracted.trade = findValue("Trade");
  extracted.level = findValue("Level");

  const moduleInfo = findValue("Module");
  if (moduleInfo) extracted.module_name = moduleInfo;

  const weekInfo = findValue("Week");
  if (weekInfo) {
    const numMatch = weekInfo.match(/\d+/);
    if (numMatch) extracted.week = parseInt(numMatch[0]);
  }

  extracted.term = findValue("Term");
  const school_year_val = findValue("School year");
  extracted.school_year = school_year_val
    ? school_year_val.replace(/Term.*/i, "").trim()
    : "";
  extracted.class_name = findValue("Class") || findValue("Class(es)");

  const traineesStr = findValue("No. Trainees") || findValue("Trainees");
  if (traineesStr) {
    const tMatch = traineesStr.match(/\d+/);
    if (tMatch) extracted.number_of_trainees = parseInt(tMatch[0]);
  }

  const dateInfo = findValue("Date");
  if (dateInfo) {
    const match = dateInfo.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
    if (match)
      extracted.lesson_date = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  const timeInfo = findValue("Time");
  if (timeInfo) {
    const tMatch = timeInfo.match(/(\d{1,2}:\d{2})\s*[-to]\s*(\d{1,2}:\d{2})/);
    if (tMatch) {
      extracted.start_time = tMatch[1];
      extracted.end_time = tMatch[2];
    }
  }

  extracted.instructor_name =
    findValue("Instructor name") || findValue("Instructor");

  // Learning Outcomes & Indicative Content block
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (
      cell.toLowerCase().includes("at the end of the lesson") ||
      cell.toLowerCase().includes("learning outcomes")
    ) {
      let content = cell
        .toLowerCase()
        .includes("at the end of the lesson, trainees will be able to:")
        ? cell.split(/at the end of the lesson, trainees will be able to:/i)[1]
        : "";

      if (!content.trim()) content = cells[i + 1] || "";

      if (content) {
        const lines = content
          .split("\n")
          .filter(
            (l) =>
              l.trim().length > 0 &&
              !l.toLowerCase().includes("learning outcomes"),
          );
        lines.forEach((line) => {
          extracted.outcomes.push({
            code: `LO${extracted.outcomes.length + 1}`,
            title: cleanText(line),
            description: cleanText(line),
            duration_minutes: 0,
            activities: [],
            resources: [],
          });
        });
      }
    }
    if (
      cell.toLowerCase() === "indicative content" ||
      cell.toLowerCase().includes("indicative content")
    ) {
      let content =
        cell.toLowerCase() === "indicative content"
          ? cells[i + 1] || ""
          : cell.split(/indicative content/i)[1];
      if (content) {
        const lines = content.split("\n").filter((l) => l.trim().length > 0);
        lines.forEach((l) => {
          extracted.indicativeContent.push({
            category: "General",
            content: cleanText(l),
          });
        });
      }
    }
    if (
      cell.toLowerCase().includes("topic of the session") ||
      cell.toLowerCase().includes("big question")
    ) {
      let topic = cell.split(/[:：]/).slice(1).join(":");
      if (!topic.trim() && cells[i + 1]) topic = cells[i + 1];
      extracted.big_question = cleanText(topic);
    }
  }

  // Section parsing (Introduction, Development, Conclusion)
  let currentSectionType = null;
  $("tr").each((i, tr) => {
    const tds = $(tr).find("td, th").toArray();
    if (tds.length === 0) return;

    const firstCellText = cheerio
      .load($(tds[0]).html() || "")
      .text()
      .trim()
      .toLowerCase();

    // Check if this row is a section header or contains the section tag
    if (firstCellText.includes("introduction"))
      currentSectionType = "Introduction";
    else if (
      firstCellText.includes("development/body") ||
      firstCellText.includes("development")
    )
      currentSectionType = "Development";
    else if (
      firstCellText.includes("conclusion/plenary") ||
      firstCellText.includes("conclusion")
    )
      currentSectionType = "Conclusion";

    // If it's a content row (usually has trainer activities, resources, duration)
    if (
      currentSectionType &&
      (firstCellText.includes("trainer's activities") ||
        firstCellText.includes("trainer’s activities") ||
        firstCellText.includes("lo1"))
    ) {
      const section = {
        section_type: currentSectionType,
        trainer_activities: "",
        learner_activities: "",
        resources: "",
        duration_minutes: 0,
      };

      let colText = (idx) =>
        cheerio
          .load(
            $(tds[idx])
              .html()
              ?.replace(/<br\s*\/?>/gi, "\n")
              .replace(/<\/p>/gi, "\n</p>") || "",
          )
          .text()
          .trim();

      // Pattern: Trainer/Learner Activities | Resources | Duration
      // First column has the activities. We can extract Trainer vs Learner if combined
      let activitiesText = colText(0);

      // Extract Trainer and Learner sections if they are in the same cell
      if (
        activitiesText.toLowerCase().includes("trainer's activities") ||
        activitiesText.toLowerCase().includes("trainer’s activities")
      ) {
        section.trainer_activities = activitiesText; // Just dump it all for now, or we could split
      }

      // Resources is usually the next column, duration last
      if (tds.length >= 2) {
        const lastColText = colText(tds.length - 1);
        const timeMatches = lastColText.match(/(\d+)\s*(?:min|minutes|m)/i);
        if (timeMatches) {
          section.duration_minutes = parseInt(timeMatches[1]);
        } else {
          // Check the standalone cell for just a number if the next cell is "minutes"
          const numMatch = lastColText.match(/^(\d+)$/);
          if (numMatch) section.duration_minutes = parseInt(numMatch[1]);
        }

        // Resources
        if (tds.length >= 3) {
          section.resources = colText(tds.length - 2);
        } else {
          section.resources = colText(1); // 2 columns case
        }
      }

      extracted.sections.push(section);

      // Reset so we don't capture multiple lines unless they are clearly activities
      currentSectionType = null;
    }
  });

  console.log(`\n\n--- RESULTS FOR ${filename} ---`);
  console.log(JSON.stringify(extracted, null, 2));
}

async function run() {
  await testExtraction("Template 1.docx");
  console.log("=========================================");
  await testExtraction("Template 2.docx");
}
run();
