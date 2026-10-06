Synthesize the gate critique for one plan into the human's decision questions, and write your pending questions file.

ref: implementation/download-my-data-s1-export-endpoint.md
planMtimeMs: 1786000000000
gate: Gate 2 (implementation → todo)
project root: {project_root}

The four lens critics returned these payloads (JSON, verbatim, one per line):

{"ref":"implementation/download-my-data-s1-export-endpoint.md","lens":"premortem","findings":[{"id":"export-leaks-other-peoples-data","severity":"critical","confidence":"HIGH","claim":"Any signed-in person can download another person's records by changing the userId in the export link.","evidence":"src/routes/export.js:9 passes req.query.userId straight to store.recordsFor; nothing compares it with the signed-in user.","decision":"Ship the handler as it stands, or bind the export to the signed-in user first?","options":[{"key":"1","label":"Bind the export to the signed-in user","pros":"Closes the leak before it ships.","cons":"One more change to the handler and its test."},{"key":"2","label":"Ship as planned","pros":"No change to the plan.","cons":"Every person's data is downloadable by every other signed-in person."}]}]}
{"ref":"implementation/download-my-data-s1-export-endpoint.md","lens":"devils-advocate","findings":[]}
{"ref":"implementation/download-my-data-s1-export-endpoint.md","lens":"red-team","findings":[{"id":"idor-on-export","severity":"high","confidence":"HIGH","claim":"Insecure direct object reference: the export endpoint trusts a user id supplied by the client.","evidence":"src/routes/export.js exportHandler reads req.query.userId; requireLogin at src/auth/session.js:9 checks only that someone is signed in, not who.","decision":"Accept a client-chosen user id on the export endpoint?","options":[{"key":"a","label":"Use the session's user id and drop the query parameter","pros":"An attacker cannot choose whose data is returned.","cons":"The account page link changes."},{"key":"b","label":"Keep the query parameter","pros":"No change.","cons":"Horizontal privilege escalation on personal data."}]}]}
{"ref":"implementation/download-my-data-s1-export-endpoint.md","lens":"advocate","findings":[]}
