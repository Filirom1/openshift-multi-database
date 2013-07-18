var replacestream = require('replacestream');
var glob = require("glob");
var async = require("async");

module.export = function(params, cb){
  var regex = params.regex;
  var replacement = params.replacement;
  var path = params.path
  glob("**", {
    cwd: path,
    dot: true,
  }, function(err, files){
    if(err) return cb(err);
    async.each(files, function(file, cb){
      fs.createReadStream(file).pipe(replaceStream(regex, replacement))
        .pipe(fs.createWriteStream(file + '.next'))
        .on('end', function(){
          fs.unlink(file, function(err){
            if(err) return cb(err);
            fs.rename(file + '.next', file, cb)
          });
      }).on('error', function(err){
        return cb(err);
      });
    }, cb);
  });
};
