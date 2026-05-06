const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const mammoth = require("mammoth");

async function extractAll(filename) {
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

  // Get inner text from element
  const getInnerText = (el) => {
    let h = $(el).html() || "";
    h = h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
    return cheerio.load(h).text().trim();
  };

  // Inline header scan for merged header cells
  const inlineFind = (label) => {
    let found = "";
    $("th, td").each((_i, el) => {
      if (found) return;
      const text = getInnerText(el);
      const escaped = label
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/&amp;/gi, "&");
      const re = new RegExp(
        escaped + "[^:\\n]*[:\\uff1a]\\s*([^\\n]*)(?:\\n([^\\n]+))?",
        "i",
      );
      const m = text.match(re);
      if (m) {
        const sameLine = (m[1] || "").trim();
        const nextLine = (m[2] || "").trim();
        found = cleanText(sameLine || nextLine);
      }
    });
    return found;
  };

  extracted.sector = inlineFind("Sector") || inlineFind("Department");
  extracted.trade = inlineFind("Trade");
  extracted.level = inlineFind("Level");
  extracted.term = inlineFind("Term");
  extracted.school_year = inlineFind("School year")
    .replace(/Term.*/i, "")
    .trim();
  extracted.class_name = inlineFind("Class(es)") || inlineFind("Class");
  extracted.instructor_name =
    inlineFind("Instructor name") || inlineFind("Instructor");
  extracted.module_name = inlineFind("Module (Code") || inlineFind("Module");

  extracted.language_focus = inlineFind("Language focus");
  extracted.facilitation_techniques = inlineFind("Facilitation technique");
  extracted.specific_subject_knowledge = inlineFind(
    "Specific subject knowledge",
  );

  const weekStr = inlineFind("Week");
  if (weekStr) {
    const wm = weekStr.match(/\d+/);
    if (wm) extracted.week = parseInt(wm[0]);
  }
  const traineesStr = inlineFind("No. Trainees") || inlineFind("Trainees");
  if (traineesStr) {
    const tm = traineesStr.match(/\d+/);
    if (tm) extracted.number_of_trainees = parseInt(tm[0]);
  }
  const dateStr = inlineFind("Date");
  if (dateStr) {
    const dm = dateStr.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
    if (dm)
      extracted.lesson_date = `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  }
  const timeStr = inlineFind("Time");
  if (timeStr) {
    const tm = timeStr.match(/(\d{1,2}:\d{2})\s*[-\u2013]\s*(\d{1,2}:\d{2})/);
    if (tm) {
      extracted.start_time = tm[1];
      extracted.end_time = tm[2];
    }
  }

  // Row-by-row extraction
  $("tr").each((_i, tr) => {
    const tds = $(tr).find("th, td").toArray();
    if (tds.length === 0) return;
    const labelCell = getInnerText(tds[0]).toLowerCase().trim();
    const valueAll = tds
      .slice(1)
      .map((td) => getInnerText(td))
      .join("\n")
      .trim();
    const allCellsText = tds.map((td) => getInnerText(td)).join(" ");

    if (
      labelCell === "learning outcomes" ||
      labelCell.startsWith("learning outcome")
    ) {
      const lines = valueAll
        .replace(/^at the end of the lesson[^\n]*\n?/i, "")
        .split("\n")
        .map((l) => cleanText(l))
        .filter((l) => l.length > 5);
      lines.forEach((line) =>
        extracted.outcomes.push({
          code: `LO${extracted.outcomes.length + 1}`,
          title: line,
          description: line,
          duration_minutes: 0,
          activities: [],
          resources: [],
        }),
      );
    } else if (labelCell === "indicative content") {
      valueAll
        .split("\n")
        .map((l) => cleanText(l))
        .filter((l) => l.length > 3)
        .forEach((l) =>
          extracted.indicativeContent.push({ category: "General", content: l }),
        );
    } else if (
      allCellsText.toLowerCase().includes("topic of the session") ||
      allCellsText.toLowerCase().includes("big question")
    ) {
      const stripped = allCellsText
        .replace(/topic of the session[^:]*:/i, "")
        .replace(/big question[^:]*:/i, "")
        .trim();
      if (stripped) extracted.big_question = cleanText(stripped);
    } else if (labelCell.startsWith("range")) {
      const minMatch = valueAll.match(/(\d+)\s*minutes?/i);
      if (minMatch) extracted.total_duration_minutes = parseInt(minMatch[1]);
    } else if (
      labelCell.includes("objectives") ||
      labelCell.includes("learning intentions")
    ) {
      extracted.session_objectives = cleanText(
        allCellsText
          .replace(/objectives\/learning intentions[^:]*:/i, "")
          .trim(),
      );
    } else if (labelCell.includes("language focus")) {
      extracted.language_focus =
        extracted.language_focus || cleanText(valueAll);
    } else if (labelCell.includes("facilitation technique")) {
      extracted.facilitation_techniques =
        extracted.facilitation_techniques || cleanText(valueAll);
    } else if (labelCell.includes("specific subject knowledge")) {
      extracted.specific_subject_knowledge =
        extracted.specific_subject_knowledge || cleanText(valueAll);
    } else if (
      labelCell.includes("assignment") ||
      labelCell.includes("homework")
    ) {
      extracted.assignments.push({ description: cleanText(allCellsText) });
    } else if (
      labelCell.includes("evaluation of the session") ||
      (labelCell.includes("evaluation") && labelCell.includes("teacher"))
    ) {
      extracted.evaluation.teacher_notes = cleanText(allCellsText);
    } else if (labelCell.startsWith("reference")) {
      extracted.evaluation.references = cleanText(valueAll);
    }
  });

  // Prepared/Verified by
  $("p").each((_i, p) => {
    const t = getInnerText(p);
    const prepM = t.match(/prepared\s+(?:and\s+signed\s+)?by[:\s]+(.+)/i);
    if (prepM) extracted.evaluation.prepared_by = cleanText(prepM[1]);
    const veriM = t.match(/verified\s+by[:\s]+(.+)/i);
    if (veriM) extracted.evaluation.verified_by = cleanText(veriM[1]);
  });

  // Sections
  let activeSection = null;
  $("tr").each((_i, tr) => {
    const tds = $(tr).find("th, td").toArray();
    if (tds.length === 0) return;
    const rowText = tds
      .map((td) => getInnerText(td))
      .join(" ")
      .toLowerCase();

    // Check if row marks a section transition
    let newSectionType = null;
    const firstCellText = getInnerText(tds[0]).toLowerCase();

    if (
      firstCellText === "introduction" ||
      firstCellText.startsWith("introduction ")
    )
      newSectionType = "Introduction";
    else if (
      firstCellText === "development/body" ||
      firstCellText === "development" ||
      firstCellText.startsWith("development ")
    )
      newSectionType = "Development";
    else if (
      firstCellText === "conclusion" ||
      firstCellText.startsWith("conclusion/plenary")
    )
      newSectionType = "Conclusion";

    if (
      newSectionType &&
      (!activeSection || activeSection.section_type !== newSectionType)
    ) {
      activeSection = {
        section_type: newSectionType,
        trainer_activities: "",
        learner_activities: "",
        resources: "",
        duration_minutes: 0,
      };
      extracted.sections.push(activeSection);
      // If this row is ONLY the header (small text), skip parsing activities from it to avoid junk.
      if (
        rowText.length < 50 &&
        !rowText.includes("trainer") &&
        !rowText.includes("trainee")
      )
        return;
    }

    if (!activeSection) return;

    const cell0Text = getInnerText(tds[0]);
    const c0Lower = cell0Text.toLowerCase();

    // Has Trainer activities?
    if (c0Lower.includes("trainer")) {
      // Match from "Trainer's activities" up to either "Learner's activities" or end of string
      const m = cell0Text.match(
        /trainer.*?activities[:\s]*([\s\S]+?)(?=(?:learner|trainee).*?activities|$)/i,
      );
      let content = m ? cleanText(m[1]) : cleanText(cell0Text);
      // Remove any leading "LO1: ... LO2: ..."
      content = content.replace(/^(?:LO\d+.*?\n)+/gi, "").trim();
      if (content && !content.match(/^trainer.*?activities$/i)) {
        activeSection.trainer_activities +=
          (activeSection.trainer_activities ? "\n" : "") + content;
      }
    }

    // Has Learner/Trainee activities?
    if (c0Lower.includes("trainee") || c0Lower.includes("learner")) {
      const m = cell0Text.match(
        /(?:learner|trainee).*?activities[:\s]*([\s\S]+)/i,
      );
      let content = m ? cleanText(m[1]) : "";
      if (!m && !c0Lower.includes("trainer")) {
        content = cleanText(cell0Text).replace(
          /^(?:learner|trainee).*?activities[:\s]*/i,
          "",
        );
      }
      if (content) {
        activeSection.learner_activities +=
          (activeSection.learner_activities ? "\n" : "") + content;
      }
    }

    // Has Resources?
    if (tds.length >= 2) {
      // Resources is usually cell 1 if 3+ cells, or cell 1 if 2 cells but only if it's not purely a duration.
      const resText = getInnerText(
        tds.length >= 3 ? tds[tds.length - 2] : tds[1],
      );
      if (
        resText &&
        !resText.toLowerCase().includes("minutes") &&
        !resText.match(/^\d+$/)
      ) {
        activeSection.resources +=
          (activeSection.resources ? " " : "") + cleanText(resText);
      }
    }

    // Has Duration? (Aggregate all "X minutes" matches)
    const allMins = [...rowText.matchAll(/(\d+)\s*min(?:utes?)?/gi)];
    let sumMins = 0;
    allMins.forEach((m) => (sumMins += parseInt(m[1] || "0")));
    if (sumMins > 0) {
      activeSection.duration_minutes += sumMins;
    }
  });

  return extracted;
}

extractAll("Template 1.docx")
  .then((data) => {
    console.log(JSON.stringify(data, null, 2));
    console.log("\n\n=== SUMMARY ===");
    console.log("Session Code:", data.session_code || "N/A");
    console.log("Sector:", data.sector);
    console.log("Trade:", data.trade);
    console.log("Level:", data.level);
    console.log("Module:", data.module_name);
    console.log("Week:", data.week);
    console.log("Term:", data.term);
    console.log("School Year:", data.school_year);
    console.log("Class:", data.class_name);
    console.log("No. Trainees:", data.number_of_trainees);
    console.log("Date:", data.lesson_date);
    console.log("Time:", data.start_time, "-", data.end_time);
    console.log("Instructor:", data.instructor_name);
    console.log("Duration (mins):", data.total_duration_minutes);
    console.log("Big Question:", data.big_question);
    console.log("Outcomes:", data.outcomes.length);
    data.outcomes.forEach((o) => console.log(" -", o.code, ":", o.title));
    console.log("Indicative Content:", data.indicativeContent.length, "items");
    console.log("Sections:", data.sections.length);
    data.sections.forEach((s) =>
      console.log(" -", s.section_type, "(", s.duration_minutes, "min )"),
    );
    console.log(
      "Language Focus:",
      (data.language_focus || "").substring(0, 80),
    );
    console.log(
      "Facilitation:",
      (data.facilitation_techniques || "").substring(0, 80),
    );
    console.log("Assignments:", data.assignments.length);
    console.log("Prepared by:", data.evaluation?.prepared_by);
    console.log("Verified by:", data.evaluation?.verified_by);
    console.log(
      "References:",
      (data.evaluation?.references || "").substring(0, 80),
    );
  })
  .catch(console.error);
