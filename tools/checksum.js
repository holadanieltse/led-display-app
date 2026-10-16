#!/usr/bin/env node
// MCS Protocol v3.1 Sum-mode checksum calculator
// Usage:
//   node checksum.js <file>           # read content from a file
//   node checksum.js "literal"        # pass the string directly
//   echo "literal" | node checksum.js # pipe from stdin

const fs = require('fs');

let content;
if (process.argv.length === 3 && fs.existsSync(process.argv[2])) {
  content = fs.readFileSync(process.argv[2], 'ascii');
} else if (process.argv.length === 3) {
  content = process.argv[2];
} else {
  content = fs.readFileSync(0, 'ascii');
}

let sum = 0;
for (let i = 0; i < content.length; i++) {
  sum = (sum + content.charCodeAt(i)) & 0xFFFF;
}

const hex = sum.toString(16).toUpperCase().padStart(4, '0');
console.log(`Length: ${content.length} bytes`);
console.log(`Sum:    ${sum} (0x${hex})`);
console.log(`Result: ^D${hex}`);