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

  $("tr").each((i, tr) => {
    const tds = $(tr).find("th, td").toArray();
    const rt = tds
      .map((td) => getInnerText(td))
      .join(" ")
      .toLowerCase();
    if (
      rt.includes("development") ||
      rt.includes("trainer") ||
      rt.includes("trainee") ||
      rt.includes("learner") ||
      rt.includes("conclusion")
    ) {
      console.log("\n--- ROW ---");
      tds.forEach((td, idx) =>
        console.log(
          `TD ${idx}:`,
          getInnerText(td).substring(0, 100).replace(/\n/g, "\\n"),
        ),
      );
    }
  });
}
run();
