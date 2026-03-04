const fs = require('fs');
const http = require('http');
const FormData = require('form-data');
const path = require('path');

const filePath = path.join(__dirname, 'Template 1.docx');
if (!fs.existsSync(filePath)) {
  fs.copyFileSync('../docs/Template 1.docx', filePath);
}

const form = new FormData();
form.append('file', fs.createReadStream(filePath));

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/v1/lesson-plans/upload-doc',
  method: 'POST',
  headers: form.getHeaders()
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
     try { 
       const json = JSON.parse(data); 
       console.log(JSON.stringify(json, null, 2));
     } catch(e) { 
       console.log(data); 
     }
  });
});
req.on('error', e => console.error(e));
form.pipe(req);
