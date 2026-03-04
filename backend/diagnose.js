const fs = require("fs"),
  cheerio = require("cheerio"),
  mammoth = require("mammoth");
async function run() {
  const result = await mammoth.convertToHtml({
    buffer: fs.readFileSync("Template 1.docx"),
  });
  const $ = cheerio.load(result.value);

  const cleanText = (t) => t.trim().replace(/\s+/g, " ");
  const getInnerText = (el) => {
    let h = $(el).html() || "";
    h = h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
    return cheerio.load(h).text().trim();
  };

  // New inlineFind matching the controller
  const inlineFind = (label) => {
    let found = "";
    $("th,td").each((_, el) => {
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

  console.log("Module:", inlineFind("Module (Code"));
  console.log("Module fallback:", inlineFind("Module"));
  console.log("Language focus:", inlineFind("Language focus"));
  console.log("Facilitation:", inlineFind("Facilitation technique"));
  console.log("Sector:", inlineFind("Sector"));
  console.log("Trade:", inlineFind("Trade"));
  console.log("Level:", inlineFind("Level"));
  console.log("Term:", inlineFind("Term"));
  console.log("Date:", inlineFind("Date"));
  console.log("Time:", inlineFind("Time"));
  console.log("Instructor:", inlineFind("Instructor"));
  console.log("Class:", inlineFind("Class(es)"));
}
run();
