'use strict';

module.exports = function(grunt) {
  grunt.initConfig({
    'mocha_istanbul': {
      coverage: {
        src: ['unit_tests', 'src'],
        options: {
          mask: '**/*.js',
        },
      },
    },
    'istanbul_check_coverage': {
      default: {
        options: {
          coverageFolder: 'coverage*',
          check: {
            lines: 70,
            statements: 70,
          },
        },
      },
    },
    'eslint': {
      options: {
        configFile: '.eslintrc.yml',
      },
      target: ['Gruntfile.js', 'src/**/*.js', 'tests/**/*.js'],
    },
    'babel': {
      options: {
        sourceMap: true,
      },
      dist: {
        files: [{
          expand: true,
          cwd: 'src/',
          src: ['*.js'],
          dest: 'dist/',
        }],
      },
    },
  });

  grunt.loadNpmTasks('grunt-mocha-istanbul');
  grunt.loadNpmTasks('grunt-eslint');
  grunt.loadNpmTasks('grunt-babel');

  grunt.registerTask('default', ['eslint']);
  grunt.registerTask('test', ['default', 'mocha_istanbul:coverage', 'istanbul_check_coverage', 'babel']);
};
