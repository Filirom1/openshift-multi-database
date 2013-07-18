var fs = require('fs');
var Path = require('path');
var glob = require("glob");
var async = require("async");

module.exports = function(params, cb){
  var regex = new RegExp(params.regex);
  var replacement = params.replacement;
  var path = params.path
  glob("*/env/*", {
    cwd: path,
    dot: true,
  }, function(err, files){
    if(err) return cb(err);
    async.each(files, function(file, cb){
      if(!regex.test(file))return cb();
      file = Path.join(path, file)
      fs.rename(file, file.replace(regex, replacement), cb)
    }, cb);
  });
};
