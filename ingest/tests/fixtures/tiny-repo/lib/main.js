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

app.start = function () {
  return this.listen();
};

app.config = {};

app['computed'] = function computed() {
  return format('computed');
};

var names = ['dynamic'];
names.forEach(function (name) {
  app[name] = function () {
    return format(name);
  };
});

function setup() {
  app.nested = function nested() {
    return format('nested');
  };
}

var res = Object.create(Object.prototype);

res.send = function send() {
  return format('send');
};

res.json = res.jsonAlias = function () {
  this.send();
  return format('json');
};

module.exports.banner = banner;
module.exports.outer = outer;
module.exports.shout = shout;
module.exports.passAsValue = passAsValue;
module.exports.Widget = Widget;
module.exports.setup = setup;
module.exports.res = res;
