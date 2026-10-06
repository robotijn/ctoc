'use strict';

const fs = require('node:fs');
const mailer = require('ctoc-hd-fixture-no-such-package-20261006-qzvx');

/** Reads an invoice file and mails it. */
async function sendInvoice(file, to) {
  const body = await fs.promises.readFile(file, 'utf8');
  return mailer.send({ to, subject: 'Your invoice', body });
}

module.exports = { sendInvoice };
