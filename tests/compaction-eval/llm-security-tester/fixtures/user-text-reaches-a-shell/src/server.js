'use strict';

const http = require('node:http');
const { fixProblem } = require('./helpdesk');

const MAX_BODY = 4096;

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/fix') {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY) req.destroy();
  });
  req.on('end', () => {
    let message;
    try {
      message = JSON.parse(body).message;
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (typeof message !== 'string') {
      res.writeHead(400).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' }).end(fixProblem(message));
  });
});

module.exports = { server };
