/*jshint jasmine: true, node: true */
'use strict';

const fs = require('fs-extra');
const promptly = require('promptly');
const mock = require('mock-require');
const logger = require('winston');
const EventEmitter = require('events').EventEmitter;
const emitter = new EventEmitter();

const sendLine = (line, cb) => {
  setImmediate(() => {
    process.stdin.emit('data', line + '\n');
    cb();
  });
};

let stdout = null;
let customError = '';

const oldWrite = process.stdout.write;
process.stdout.write = function (data) {
  stdout += data;
  return oldWrite.apply(process.stdout, arguments);
};

beforeEach(() => {
  spyOn(promptly, 'prompt').and.callThrough();
  mock('git-clone', (url, path, cb) => {
    cb(customError);
  });
  mock('cross-spawn', () => emitter);
  customError = null;
  stdout = '';
});

describe('skyux new command', () => {

  it('should ask for a spa name and url', (done) => {
    spyOn(fs, 'readJsonSync').and.returnValue({});
    spyOn(fs, 'writeJsonSync');
    require('../lib/new')();
    sendLine('some-spa-name', () => {
      sendLine('', () => {
        expect(stdout).toContain(
          'What is the root directory for your SPA? (example: my-spa-name)'
        );
        expect(stdout).toContain(
          'What is the URL to your repo? (leave this blank if you don\'t know)'
        );
        done();
      });
    });
  });

  it('should clone custom template repositories', (done) => {
    spyOn(logger, 'info');
    const customTemplateName = 'valid-template-name';
    const skyuxNew = require('../lib/new')({
      template: customTemplateName
    });
    sendLine('some-spa-name', () => {
      sendLine('', () => {
        skyuxNew.then(() => {
          expect(logger.info).toHaveBeenCalledWith(
            `${customTemplateName} template successfully cloned.`
          );
          done();
        });
      });
    });
  });

  it('should clone the default template if custom template not provided', (done) => {
    spyOn(logger, 'info');
    const skyuxNew = require('../lib/new')();
    sendLine('some-spa-name', () => {
      sendLine('', () => {
        skyuxNew.then(() => {
          expect(logger.info).toHaveBeenCalledWith('default template successfully cloned.');
          done();
        });
      });
    });
  });

  it('should catch a spa name with invalid characters', (done) => {
    require('../lib/new')();
    sendLine('This Is Invalid', () => {
      expect(stdout).toContain(
        'SPA root directories may only contain lower-case letters, numbers or dashes.\n'
      );
      done();
    });
  });

  it('should catch a spa directory that already exists', (done) => {
    spyOn(fs, 'existsSync').and.returnValue(true);
    require('../lib/new')();
    sendLine('some-spa-name', () => {
      expect(stdout).toContain('SPA directory already exists.\n');
      done();
    });
  });

  it('should handle an error cloning the default template', (done) => {
    customError = 'TEMPLATE_ERROR_1';
    spyOn(fs, 'existsSync').and.returnValue(false);
    spyOn(logger, 'error');
    const skyuxNew = require('../lib/new')();
    sendLine('some-spa-name', () => {
      sendLine('', () => {
        skyuxNew.then(() => {
          expect(logger.error).toHaveBeenCalledWith('TEMPLATE_ERROR_1');
          done();
        });
      });
    });
  });

  it('should handle an error cloning a custom template', (done) => {
    customError = 'TEMPLATE_ERROR_2';
    spyOn(fs, 'existsSync').and.returnValue(false);
    spyOn(logger, 'error');
    const skyuxNew = require('../lib/new')({
      template: 'invalid-template-name'
    });
    sendLine('some-spa-name', () => {
      sendLine('', () => {
        skyuxNew.then(() => {
          expect(logger.error).toHaveBeenCalledWith('TEMPLATE_ERROR_2');
          done();
        });
      });
    });
  });

  it('should handle an error cloning the repo', (done) => {
    customError = 'CUSTOM-ERROR2';
    spyOn(fs, 'existsSync').and.returnValue(false);
    spyOn(logger, 'error');
    const skyuxNew = require('../lib/new')();
    sendLine('some-spa-name', () => {
      sendLine('some-spa-repo', () => {
        skyuxNew.then(() => {
          expect(logger.error).toHaveBeenCalledWith('CUSTOM-ERROR2');
          done();
        });
      });
    });
  });

  it('should handle a non-empty repo when cloning', (done) => {
    spyOn(fs, 'existsSync').and.returnValue(false);
    spyOn(fs, 'readdirSync').and.returnValue([
      '.git',
      'README.md',
      '.gitignore',
      'repo-not-empty'
    ]);
    spyOn(logger, 'error');
    const skyuxNew = require('../lib/new')();
    sendLine('some-spa-name', () => {
      sendLine('some-spa-repo', () => {
        skyuxNew.then(() => {
          expect(logger.error).toHaveBeenCalledWith(
            'skyux new only works with empty repositories.'
          );
          done();
        });
      });
    });
  });

  it('should ignore .git and README.md files when cloning and run npm install', (done) => {
    spyOn(fs, 'existsSync').and.returnValue(false);
    spyOn(fs, 'readdirSync').and.returnValue([
      '.git',
      'README.md',
      '.gitignore'
    ]);
    spyOn(fs, 'readJsonSync').and.returnValue({});
    spyOn(fs, 'writeJsonSync');
    spyOn(fs, 'removeSync');
    spyOn(fs, 'copySync');
    spyOn(logger, 'info');
    const skyuxNew = require('../lib/new')();
    sendLine('some-spa-name', () => {
      sendLine('some-spa-repo', () => {
        skyuxNew.then(() => {
          emitter.emit('exit');
          expect(logger.info).toHaveBeenCalledWith('Running npm install');
          expect(logger.info).toHaveBeenCalledWith(
            'Change into that directory and run "skyux serve" to begin.'
          );
          done();
        });
      });
    });
  });

  it('should handle errors when cleaning the template', (done) => {
    spyOn(fs, 'existsSync').and.returnValue(false);
    spyOn(fs, 'readdirSync').and.returnValue([
      '.git',
      'README.md',
      '.gitignore'
    ]);
    spyOn(fs, 'readJsonSync').and.returnValue({});
    spyOn(logger, 'info');
    const skyuxNew = require('../lib/new')();
    sendLine('some-spa-name', () => {
      sendLine('some-spa-repo', () => {
        skyuxNew.then(() => {
          expect(logger.info).toHaveBeenCalledWith('Template cleanup failed.');
          done();
        });
      });
    });
  });

});
