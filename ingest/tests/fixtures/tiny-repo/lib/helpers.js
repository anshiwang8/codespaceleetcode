'use strict';

function shout(text) {
  return text.toUpperCase();
}

function quiet(text) {
  return text.toLowerCase();
}

module.exports = shout;
module.exports.quiet = quiet;
