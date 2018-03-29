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
        files: {
          'dist/conf.js': 'src/conf.js',
          'dist/index.js': 'src/index.js',
          'dist/stereotype_client.js': 'src/stereotype_client.js',
        },
      },
    },
  });

  grunt.loadNpmTasks('grunt-mocha-istanbul');
  grunt.loadNpmTasks('grunt-eslint');
  grunt.loadNpmTasks('grunt-babel');

  grunt.registerTask('default', ['eslint', 'babel']);
  grunt.registerTask('test', ['default', 'mocha_istanbul:coverage', 'istanbul_check_coverage']);
};
