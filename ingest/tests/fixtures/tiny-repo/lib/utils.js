'use strict';

function base(text) {
  return text.trim();
}

exports.clean = function clean(text) {
  return base(text);
};

exports.cleanAll = function cleanAll(items) {
  return items.map(exports.clean);
};
