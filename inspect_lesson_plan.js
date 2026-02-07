const mammoth = require("mammoth");
const fs = require("fs");

const filePath =
  "/Users/m2pro/dev/projects/nga_central_mis/Lesson plan Example.docx";

mammoth
  .convertToHtml({ path: filePath })
  .then(function (result) {
    const html = result.value; // The generated HTML
    const messages = result.messages; // Any messages, such as warnings during conversion
    console.log(html);
  })
  .done();
