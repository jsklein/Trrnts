var _ = require('lodash'),
    redis = require('../redis')(),
    parseMagnetURI = require('magnet-uri'),
    magnets = {},
    queue = require('../workers/queue');

var util = {};

// Converts a single infoHash/ an array of infoHashes into an array of magnet
// objects.
util.infoHashesToMagnets = function (infoHashes, callback) {
  if (!Array.isArray(infoHashes)) {
    infoHashes = [infoHashes];
  }
  var multi = redis.multi();
  _.each(infoHashes, function (infoHash) {
    multi.hgetall('magnet:' + infoHash);
    multi.zrevrange(['magnet:' + infoHash + ':peers', 0, 50, 'WITHSCORES']);
    console.log(['magnet:' + infoHash + ':peers', 0, 50, 'WITHSCORES'].join(' '));
  });
  multi.exec(function (err, results) {
    var magnets = [];

    // Every second result is the result of a ZREVRANGE (peer data for charts).
    _.each(_.range(0, results.length, 2), function (index) {
      results[index].peers = results[index+1];
      magnets.push(results[index]);
    });

    callback(null, magnets);
  });
};

// create('127.0.0.1', 'magnet:?xt=urn:btih:c066...1337') #=> insert magnet URI
// into database
magnets.create = function (ip, magnetURI, callback) {
  var parsedMagnetURI = {};
  try {
    parsedMagnetURI = parseMagnetURI(magnetURI);
  } catch (e) {  }
  // Empty parsed object -> invalid magnet link!
  if (_.isEmpty(parsedMagnetURI)) {
    callback('Invalid Magnet URI');
    return;
  }
  // Don't insert duplicates!
  redis.exists('magnet:' + parsedMagnetURI.infoHash, function (err, exists) {
    if (exists) {
      callback(new Error('This Magnet URI has already been submitted'));
    } else {
      // Everything is ok, insert Magnet into database.
      // Create an empty magnet object.
      var magnet = {};
      magnet.name = parsedMagnetURI.name;
      magnet.ip = ip;
      magnet.infoHash = parsedMagnetURI.infoHash;
      magnet.createdAt = _.now();
      magnet.magnetURI = magnetURI;
      magnet.score = -1;

      redis.hmset('magnet:' + magnet.infoHash, magnet);
      redis.zadd('magnets:top', magnet.score, magnet.infoHash);
      redis.zadd('magnets:latest', magnet.createdAt, magnet.infoHash);
      redis.sadd('magnets:ip:' + magnet.ip, magnet.infoHash);

      var job = queue.create('crawl', {
        title: 'First time crawl of ' + magnet.infoHash,
        infoHash: magnet.infoHash
      }).save(function (err) {
        if (err) {
          console.error('Experienced error while creating new job (id: ' + job.id + '): ' + err.message);
          console.error(err.stack);
        }
      });

      var job2 = queue.create('index', {
        title: 'Indexing of ' + magnet.infoHash,
        infoHash: magnet.infoHash
      }).save(function (err) {
        if (err) {
          console.error('Experienced error while creating new job (id: ' + job2.id + '): ' + err.message);
          console.error(err.stack);
        }
      });

      callback(null, magnet);
    }
  });
};

// readList('top', 10) #=> get top 10 magnets
magnets.readList = function (list, start, stop, callback) {
  redis.zrevrange('magnets:' + list, -stop, -start, function (err, infoHashes) {
    util.infoHashesToMagnets(infoHashes, callback);
  });
};

// readMagnet('chkdewyduewdg') #=> get a single magnet link
magnets.readMagnet = util.infoHashesToMagnets;


// search('Game of Thrones') #=> get all torrents that have those words, case-sensitive
magnets.search = function (search, callback) {
  // Format : 'search:' + word
  // Convert Each Word into a key Format

  var formattedWords = _.map(search.toLowerCase().split(' '), function (word) {
    return 'search:'+ word;
  });

  // Get InfoHashes for set of words through intersect
  redis.sinter(formattedWords, function (err, results) {
    if (err) {
      return callback(err, []);
    }

    // get magnetLinks for InfoHashes
    var multi = redis.multi();
    _.map(results, function (infoHash) {
      multi.hgetall('magnet:' + infoHash);
    });
    multi.exec(callback);
  });
};

module.exports = exports = magnets;
