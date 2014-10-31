var fs = require("fs");

module.exports = Object.keys(fs).reduce(function(mock, property) {
  if (typeof fs[property] === "function") {
    mock[property] = function() {};
  }
  return mock;
}, {});
