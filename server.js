var http = require('http');
var Url = require('url');
var request = require('request');
var yaml = require('yaml');
var targz = require('tar.gz');
var Uuid = require('node-uuid');
var rimraf = require("rimraf");
var replace = require("./replace");
var rename = require("./rename");

http.createServer(function (req, res) {
  if(/.tar.gz$/.test(req.url)){
    return download(req, res);
  }else{
    return manifest(req,res);
  }
}).listen(process.env.OPENSHIFT_NODEJS_PORT || 3000, process.env.OPENSHIFT_NODEJS_IP);

function manifest(req, res){
  var query = Url.parse(req.url).query;
  var url = query.url;
  var name = query.name;
  var cartridgeShortName = query['cartridge-short-name'];

  request.get(url, function(err, resp, body){
    if(err) return handleError(err, res);
    var manifest = load(body);
    var oldName = manifest.name;
    var oldCartridgeShortName = manifest['Cartridge-Short-Name'];
    var sourceUrl = manifest['Source-Url'];
    manifest.name = name;
    manifest['Cartridge-Short-Name'] = cartridgeShortName;

    manifest['Source-Url'] = url.format({
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
    res.end(yaml.safeDUmp(manifest));
  });
}

function download(req, res){
  var query = Url.parse(req.url).query;
  var sourceUrl = query['source-url'];
  var name = query['name'];
  var oldName = query['old-name'];
  var cartridgeShortName = query['cartridge-short-name'];
  var oldCartridgeShortName = query['old-cartridge-short-name'];

  var uuid = Uuid.v4();
  var tmpDir       = Path.join(process.env.OPENSHIFT_TMP_DIR, uuid);
  var tmpTarGzFile = Path.join(process.env.OPENSHIFT_TMP_DIR, uuid + '.tar.gz');
  request(sourceUrl).pipe(fs.createWriteStream(tmpTarGzFile));
  new targz().extract(tmpTarGzFile, tmpDir, function(err){
    if(err) return handleError(err, res);
    fs.unlink(tmpTarGzFile, function(err){
      if(err) return handleError(err, res);
      replace({
        regex: oldCartridgeShortName,
        replacement: cartridgeShortName,
        paths: [tmpDir],
        recursive: true,
        silent: true
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
}
