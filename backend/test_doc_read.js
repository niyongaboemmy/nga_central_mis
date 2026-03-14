const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

async function testRead() {
  const filePath = path.join(__dirname, "../docs/reporting_form_required_fields.docx");
  try {
    const result = await mammoth.convertToHtml({
      buffer: fs.readFileSync(filePath),
    });
    console.log("HTML Output:", result.value);
    console.log("Messages:", result.messages);
  } catch (error) {
    console.error("Error reading .doc file with mammoth:", error.message);
  }
}

testRead();
