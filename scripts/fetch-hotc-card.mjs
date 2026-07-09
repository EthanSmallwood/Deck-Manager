#!/usr/bin/env node

const url = process.argv[2];
if (!url) {
  console.error("Missing URL");
  process.exit(2);
}

try {
  const response = await fetch(url);
  const html = await response.text();
  console.log(JSON.stringify({ ok: response.ok, status: response.status, html }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, status: 0, error: error.message || String(error), html: "" }));
  process.exit(1);
}
