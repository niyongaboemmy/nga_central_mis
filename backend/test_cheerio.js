const cheerio = require("cheerio");
const fs = require("fs");

const html = fs.readFileSync("Template 1.docx.html", "utf-8");
const $ = cheerio.load(html);

const cells = [];
$("th, td").each((i, el) => {
  // using html() allows us to see <br> and replace them with \n
  let cellHtml = $(el).html() || "";
  cellHtml = cellHtml.replace(/<br\s*\/?>/gi, "\n");
  const cellText = cheerio
    .load(cellHtml)
    .text()
    .trim()
    .replace(/[ \t]+/g, " ");
  if (cellText) cells.push(cellText);
});

console.log(
  cells
    .map((c, i) => `[${i}] ${c.split("\n")[0].substring(0, 50)}...`)
    .join("\n"),
);
