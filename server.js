var http = require('http');
var Url = require('url');
var Path = require('path')
var fs = require('fs');
var querystring = require('querystring');
var request = require('request').defaults({
  proxy: process.env.http_proxy
});
var yaml = require('js-yaml');
var targz = require('tar.gz');
var Uuid = require('node-uuid');
var rimraf = require('rimraf');
var _ = require('underscore');
var replace = require('./replace');
var rename = require('./rename');

http.createServer(function (req, res) {
  if(/.tar.gz$/.test(req.url)){
    return download(req, res);
  }else if(/.ico/.test(req.url)){
  }else{
    return manifest(req,res);
  }
}).listen(process.env.OPENSHIFT_NODEJS_PORT || 3000, process.env.OPENSHIFT_NODEJS_IP);

function manifest(req, res){
  var query = Url.parse(req.url).query || '';
  query = querystring.parse(query);
  console.log('manifest: ', query);
  var url = query.url;
  var name = query.name;
  var cartridgeShortName = query['cartridge-short-name'];
  if(!url || !name || ! cartridgeShortName) return handleError(new Error('Pass url, name and cartridge-short-name query params'), res);

  debug('GET ' + url);
  request.get(url, function(err, resp, body){
    if(err) return handleError(err, res);
    var manifest = yaml.load(body);
    var oldName = manifest['Name'];
    var oldCartridgeShortName = manifest['Cartridge-Short-Name'];
    var sourceUrl = manifest['Source-Url'];
    manifest['Name'] = name;
    manifest['Cartridge-Short-Name'] = cartridgeShortName;
    manifest['Endpoints'].forEach(function(endPoint){
      if (!endPoint['Private-Port']) return;
      endPoint['Private-Port'] = _.random(1024, 9000);
    });

    var params = {
      'source-url': sourceUrl,
      'cartridge-short-name': cartridgeShortName,
      'old-cartridge-short-name': oldCartridgeShortName,
    }
    manifest['Source-Url'] = 'http://' + process.env.OPENSHIFT_APP_DNS + '?' + new Buffer(JSON.stringify(params)).toString('base64') +  '.tar.gz';

    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(yaml.safeDump(manifest));
  });
}

function download(req, res){
  var query = Url.parse(req.url).search.replace(/^\?/, '').replace(/.tar.gz$/, '');
  query = new Buffer(query, 'base64').toString('utf8')
  try{
    query = JSON.parse(query);
  }catch(err){
    if(err) return handleError(err, res);
  }
  console.log('download: ', query);

  var sourceUrl = query['source-url'];
  var cartridgeShortName = query['cartridge-short-name'];
  var oldCartridgeShortName = query['old-cartridge-short-name'];

  if(!sourceUrl || !cartridgeShortName || !oldCartridgeShortName) return handleError(new Error('Pass source-url, cartridge-short-name, and old-cartridge-short-name in JSON encoded in base64 in the path ;)'), res);

  var uuid = Uuid.v4();
  var tmpDir       = Path.join(process.env.OPENSHIFT_TMP_DIR, uuid);
  var tmpTarGzFile = Path.join(process.env.OPENSHIFT_TMP_DIR, uuid + '.tar.gz');
  debug('GET ' + sourceUrl);
  var requ = request.get(sourceUrl);
  requ.pipe(fs.createWriteStream(tmpTarGzFile));
  requ.on('end', function(){
    debug('tar xzf -C ' + tmpDir + ' ' + tmpTarGzFile );
    new targz().extract(tmpTarGzFile, tmpDir, function(err){
      if(err) return handleError(err, res);
      debug('rm -f ' + tmpTarGzFile );
      fs.unlink(tmpTarGzFile, function(err){
        if(err) return handleError(err, res);
        debug('s/' + oldCartridgeShortName + '/' + cartridgeShortName + '/g in ' + tmpDir );
        replace({
          regex: oldCartridgeShortName,
          replacement: cartridgeShortName,
          path: tmpDir
        }, function(err){
          if(err) return handleError(err, res);
          rename({
            regex: oldCartridgeShortName,
            replacement: cartridgeShortName,
            path: tmpDir,
            silent: true
          }, function(err){
            if(err) return handleError(err, res);
            debug('ls ' + tmpDir);
            fs.readdir(tmpDir, function(err, tmpDirChild){
              var realTmpDir = Path.join(tmpDir, tmpDirChild[0]);
              new targz().compress(realTmpDir, tmpTarGzFile, function(err){
                if(err) return handleError(err, res);
                res.writeHead(200, {'Content-Type': 'text/plain'});
                rimraf(tmpDir, function(err){
                  if(err) return handleError(err, res);
                  var stream = fs.createReadStream(tmpTarGzFile);
                  stream.pipe(res);
                  stream.on('end', function(){
                    fs.unlink(tmpTarGzFile);
                  });
                });
              });
            });
          });
        });
      });
    });
  }).on('error', function(err){
    handleError(err, res);
  });
}


function handleError(err, res){
  res.writeHead(500, {'Content-Type': 'text/plain'});
  res.end(err.message);
}

function debug(msg){
  console.log(msg);
}
