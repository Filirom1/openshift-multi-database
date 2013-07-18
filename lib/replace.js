var fs = require('fs');
var Path = require('path');
var replacestream = require('replacestream');
var glob = require("glob");
var async = require("async");

module.exports = function(params, cb){
  var regex = params.regex;
  var replacement = params.replacement;
  var path = params.path;
  glob("*/**", {
    cwd: path,
    dot: true
  }, function(err, files){
    if(err) return cb(err);
    async.each(files, function(file, cb){
      if (!file) return cb();
      file = Path.join(path, file);
      fs.stat(file, function(err, stat){
        if(err) return cb(err);
        if(!stat.isFile()) return cb();
        var stream = fs.createReadStream(file);
        stream.pipe(replacestream(regex, replacement, {regExpOptions: 'gm'})).pipe(fs.createWriteStream(file + '.next', {mode: stat.mode}));
        stream.on('end', function(){
          fs.unlink(file, function(err){
            if(err) return cb(err);
            fs.rename(file + '.next', file, cb);
          });
        }).on('error', function(err){
          return cb(err);
        });
      });
    }, cb);
  });
};
