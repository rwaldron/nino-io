var Nino = require("../lib/nino-io.js");
var board = new Nino();

board.on("ready", function() {
  console.log("READY");

  this.pinMode(11, this.MODES.PWM);

  var level = 0;
  var step = 10;

  setInterval(function() {
    if (level > 255 || level < 0) {
      step *= -1;
    }

    level += step;

    this.analogWrite(11, level);
  }.bind(this), 1000/(255/step));
});
