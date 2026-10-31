'use strict';

var shout = require('./helpers');

var banner = greet('top level');

function greet(name) {
  return format(name);
}

function format(name) {
  return 'hello ' + name;
}

function outer() {
  function inner() {
    return format('nested');
  }
  return inner();
}

function Widget(label) {
  this.label = greet(label);
}

Widget.prototype.render = function render() {
  return greet(this.label);
};

Widget.prototype.renderTwice = function renderTwice() {
  return this.render() + this.render();
};

function passAsValue() {
  return [1].map(format);
}

var app = module.exports = {};

app.listen = function listen() {
  return greet('app');
};

module.exports.banner = banner;
module.exports.outer = outer;
module.exports.shout = shout;
module.exports.passAsValue = passAsValue;
module.exports.Widget = Widget;
