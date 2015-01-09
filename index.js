'use strict';

var vary = require('vary');

function ISONP(req, res, options) {
  if (!this) return new ISONP(req, res, options);
  options = options || {};

}

ISONP.prototype.write = function write() {
  this.res.setHeader('');
  return this.res.write([
    '/**/'
  ]);
};
