var crawl = require('./crawl'),
    _ = require('lodash'),
    redis = require('../redis')(),
    geoip = require('geoip-lite');

crawl.init(function () {
  var onCrawled = function (infoHash) {
    return function (err, result) {
      if (err) {
        return;
      }
      redis.zadd('magnet:' + infoHash + ':peers', _.now(), result.peers.length);
      redis.hset('magnet:' + infoHash, 'peers', result.peers.length);
      redis.zadd('magnets:top', result.peers.length, infoHash);

      var geoMulti = redis.multi();

      _.each(result.peers, function (peer) {
        geoMulti.pfadd('peers', peer);
      });

      var geoIncrMulti = redis.multi();

      geoMulti.exec(function (err, addedArray) {
        _.each(addedArray, function (added, index) {
          if (added > 0) {
            var peer = result.peers[index];
            var ip = peer.split(':')[0];
            var geo = geoip.lookup(ip) || {};
            geo.country = geo.country || '?';
            geo.region = geo.region || '?';
            geo.city = geo.city || '?';
            geo.ll = geo.ll || ['?', '?'];
            geo.ll = geo.ll.join(',');

            geoIncrMulti.zincrby('geo:countries', 1, geo.country);
            geoIncrMulti.zincrby('geo:regions', 1, geo.region);
            geoIncrMulti.zincrby('geo:cities', 1, geo.city);
            geoIncrMulti.zincrby('geo:ll', 1, geo.ll);
          }
        });
        geoIncrMulti.exec();
      });
    };
  };

  var next = function () {
    redis.lpop('magnets:crawl', function (err, infoHash) {
      redis.rpush('magnets:crawl', infoHash);
      if (infoHash) {
        crawl(infoHash, onCrawled(infoHash));
      }
    });
    redis.lpop('magnets:crawl', function (err, infoHash) {
      redis.rpush('magnets:crawl', infoHash);
      if (infoHash) {
        crawl(infoHash, onCrawled(infoHash));
      }
    });
    redis.lpop('magnets:crawl', function (err, infoHash) {
      redis.rpush('magnets:crawl', infoHash);
      if (infoHash) {
        crawl(infoHash, onCrawled(infoHash));
      }
    });
    redis.lpop('magnets:crawl', function (err, infoHash) {
      redis.rpush('magnets:crawl', infoHash);
      if (infoHash) {
        crawl(infoHash, onCrawled(infoHash));
      }
    });
    redis.lpop('magnets:crawl', function (err, infoHash) {
      redis.rpush('magnets:crawl', infoHash);
      if (infoHash) {
        crawl(infoHash, onCrawled(infoHash));
      }
    });
    redis.lpop('magnets:crawl', function (err, infoHash) {
      redis.rpush('magnets:crawl', infoHash);
      if (infoHash) {
        crawl(infoHash, onCrawled(infoHash));
      }
    });
  };
  next();
  setInterval(next, 60*1000*1.1);
  // next();
  // setInterval(next, 60*1000*1.1);
  // next();
  // setInterval(next, 60*1000*1.1);
  // next();
  // setInterval(next, 60*1000*1.1);
  // next();
  // setInterval(next, 60*1000*1.1);


  // Example usage:
  // crawl('8CA378DBC8F62E04DF4A4A0114B66018666C17CD', function (err, results) {
  //   console.log(results);
  //
  //   process.exit(1);
  // });
});
