const fs = require("fs");
const cheerio = require("cheerio");
const mammoth = require("mammoth");

async function run() {
  const result = await mammoth.convertToHtml({
    buffer: fs.readFileSync("Template 1.docx"),
  });
  const $ = cheerio.load(result.value);

  const getInnerText = (el) => {
    let h = $(el).html() || "";
    h = h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
    return cheerio.load(h).text().trim();
  };

  let currentSection = null;
  $("tr").each((i, tr) => {
    const tds = $(tr).find("th, td").toArray();
    if (tds.length === 0) return;

    const rowText = tds
      .map((td) => getInnerText(td))
      .join(" ")
      .toLowerCase();

    if (rowText.includes("introduction") && !rowText.includes("development")) {
      currentSection = "Introduction";
    } else if (
      rowText.includes("development") ||
      rowText.includes("development/body")
    ) {
      currentSection = "Development";
    } else if (rowText.includes("conclusion") || rowText.includes("plenary")) {
      currentSection = "Conclusion";
    }

    // Check if it's an activity row
    if (
      currentSection &&
      (rowText.includes("trainer") ||
        rowText.includes("trainee") ||
        rowText.includes("learner"))
    ) {
      console.log("\n--- SECTION:", currentSection, "---");
      console.log("CELLS COUNT:", tds.length);
      tds.forEach((td, idx) => {
        console.log(
          `CELL ${idx}:`,
          getInnerText(td).substring(0, 100).replace(/\n/g, "\\n"),
        );
      });
      console.log("ROW TEXT FIRST 100:", rowText.substring(0, 100));
    }
  });
}
run();
