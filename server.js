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
var replace = require('./replace');
var rename = require('./rename');

http.createServer(function (req, res) {
  if(/.tar.gz$/.test(req.url)){
    return download(req, res);
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

    manifest['Source-Url'] = Url.format({
      protocol: 'http',
      host: process.env.OPENSHIFT_APP_DNS,
      query: {
        'source-url': sourceUrl,
        'name': name,
        'cartridge-short-name': cartridgeShortName,
        'old-name': oldName,
        'old-cartridge-short-name': oldCartridgeShortName,
        'download': 'manifest.tar.gz'
      }
    });

    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(yaml.safeDump(manifest));
  });
}

function download(req, res){
  var query = Url.parse(req.url).query || '';
  query = querystring.parse(query);
  console.log('download: ', query);

  var sourceUrl = query['source-url'];
  var name = query['name'];
  var oldName = query['old-name'];
  var cartridgeShortName = query['cartridge-short-name'];
  var oldCartridgeShortName = query['old-cartridge-short-name'];

  if(!sourceUrl || !name || !cartridgeShortName || !oldName || !oldCartridgeShortName) return handleError(new Error('Pass source-url, name and cartridge-short-name, old-name, old-cartridge-short-name query params'), res);

  var uuid = Uuid.v4();
  var tmpDir       = Path.join(process.env.OPENSHIFT_TMP_DIR, uuid);
  var tmpTarGzFile = Path.join(process.env.OPENSHIFT_TMP_DIR, uuid + '.tar.gz');
  debug('GET ' + sourceUrl);
  request.get(sourceUrl).pipe(fs.createWriteStream(tmpTarGzFile)).on('end', function(){
    debug('tar xzf -C' + tmpDir + ' ' + tmpTarGzFile );
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
            paths: [Path.join(tmpDir, 'env')],
            silent: true
          }, function(err){
            if(err) return handleError(err, res);
            new targz().compress(tmpDir, tmpTarGzFile, function(err){
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
