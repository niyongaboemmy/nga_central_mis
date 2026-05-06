const mammoth = require("mammoth");
const fs = require("fs");
const path = require("path");

async function convert(fileName) {
  const filePath = path.join(
    "/Users/m2pro/dev/projects/nga_central_mis/docs",
    fileName,
  );
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.convertToHtml({ buffer: buffer });
  // Remove base64 images to make the output readable
  const cleanHtml = result.value.replace(/<img[^>]*>/g, "[IMAGE]");

  const outPath = path.join(__dirname, fileName + ".html");
  fs.writeFileSync(outPath, cleanHtml);
  console.log(`Saved clean HTML to ${outPath}`);
}

async function main() {
  await convert("Template 1.docx");
  await convert("Template 2.docx");
}

main().catch(console.error);
