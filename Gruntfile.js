var request = require("request");

module.exports = function(grunt) {

  var task = grunt.task;
  var file = grunt.file;
  var log = grunt.log;
  var verbose = grunt.verbose;
  var fail = grunt.fail;
  var option = grunt.option;
  var config = grunt.config;
  var template = grunt.template;
  var _ = grunt.util._;



  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),
    nodeunit: {
      tests: [
        "test/nino-io.js",
      ]
    },
    jshint: {
      options: {
        latedef: false,
        curly: true,
        eqeqeq: true,
        immed: true,
        newcap: false,
        noarg: true,
        sub: true,
        undef: true,
        boss: true,
        eqnull: true,
        node: true,
        strict: false,
        esnext: true,
        globals: {
          rewire: true,
          exports: true,
          document: true,
          Promise: true,
          WeakMap: true,
          Map: true,
          window: true,
          IS_TEST_MODE: true
        }
      },
      files: {
        src: [
          "Gruntfile.js",
          "lib/**/*.js",
          "test/**/*.js",
          "eg/**/*.js"
        ]
      }
    },

    jsbeautifier: {
      files: ["lib/**/*.js", "eg/**/*.js", "test/**/*.js"],
      options: {
        js: {
          braceStyle: "collapse",
          breakChainedMethods: false,
          e4x: false,
          evalCode: false,
          indentChar: " ",
          indentLevel: 0,
          indentSize: 2,
          indentWithTabs: false,
          jslintHappy: false,
          keepArrayIndentation: false,
          keepFunctionIndentation: false,
          maxPreserveNewlines: 10,
          preserveNewlines: true,
          spaceBeforeConditional: true,
          spaceInParen: false,
          unescapeStrings: false,
          wrapLineLength: 0
        }
      }
    },
    watch: {
      src: {
        files: [
          "Gruntfile.js",
          "lib/**/*.js",
          "test/**/*.js",
          "eg/**/*.js"
        ],
        tasks: ["default"],
        options: {
          interrupt: true,
        },
      }
    }
  });

  grunt.loadNpmTasks("grunt-contrib-watch");
  grunt.loadNpmTasks("grunt-contrib-nodeunit");
  grunt.loadNpmTasks("grunt-contrib-jshint");
  grunt.loadNpmTasks("grunt-jsbeautifier");

  grunt.registerTask("default", ["jshint", "nodeunit"]);

  // Import layouts from ideino-linino-lib
  grunt.registerTask("layouts", "Update board layouts", function(version) {
    var done = this.async();
    var remote = "https://raw.githubusercontent.com/ideino/ideino-linino-lib/master/utils/layouts/";
    var local = "defs/layouts/";
    var layouts = {
      arduino_yun: null,
      digitalio: null,
      linino_one: null,
      lucky: null,
    };
    var checklist = Object.keys(layouts).slice();

    Object.keys(layouts).forEach(function(layout) {
      var file = layout + ".json";

      request(remote + file, function(error, response, body) {
        var contents;
        if (!error && response.statusCode === 200) {


          // Rename:
          //  "SHA" => "SHARED"
          //  "SER" => "SET"
          body = body.replace(/SHA/g, "SHARED").replace(/SER/g, "SET");

          // Get rid of the awful whitespace in these files and
          // format that nicely before writing to disk.
          contents = JSON.stringify(JSON.parse(body), null, 2);

          layouts[layout] = JSON.parse(body);

          grunt.file.write(local + file, contents);
          log.write(local + file + " ").success("Ok");
        }

        if (error) {
          verbose.or.write(error).error().error(error);
        } else {
          checklist.splice(checklist.indexOf(layout), 1);

          if (checklist.length === 0) {
            grunt.file.write(local + "all.json", JSON.stringify(layouts, null, 2));

            log.header("Compiling Layouts");
            log.write(local + "all.json ").success("Ok");
            done();
          }
        }
      });
    });
  });

};
