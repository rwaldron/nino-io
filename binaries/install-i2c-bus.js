var exec = require("child_process").exec;

if (process.arch === "mips" && process.platform === "linux" && process.version === "v0.10.25") {
  exec("tar -xf ./binaries/i2c-bus-0.11.1_mips-0.10.25.tar.gz -C ./node_modules",
    function (err, stdout, stderr) {
      console.log(stdout);
      console.log(stderr);
      if (err !== null) {
        console.log("install-i2c-bus error: " + err);
      }
  });
} else {
  console.log("i2c-bus was not installed.");
}

