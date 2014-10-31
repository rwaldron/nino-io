// node eg/board-ready -layout layout-name
var argv = require("minimist")(process.argv.slice(2));
var Nino = require("../lib/nino-io.js");

var board = new Nino({
  layout: argv.layout || "Linino One"
});


board.on("ready", function() {

  // console.log(this);
  console.log("Ready.");

  var pin = 11;

  this.pinMode(pin, this.MODES.OUTPUT);
  this.digitalWrite(pin, 1);


  this.pinMode(pin, this.MODES.PWM);
  this.analogWrite(pin, 255);


  this.analogRead("A0", function(data) {
    // console.log("data:", data);
    // process.exit(0);
  });

  var value = 0;
  this.digitalRead(2, function(data) {

    if (data !== value) {
      value = data;
      console.log("Changed: ", value);
    }
  });
});
