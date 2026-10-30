// Crackler: Tiny DOM helpers.
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];

export { $, $$ };
