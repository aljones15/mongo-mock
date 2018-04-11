var sift = require('sift');

//use a custom compare function so we can search on ObjectIDs
var compare = sift.compare;
sift.compare = function(a, b) {
        if (a.equals) {
            return a.equals(b)
                ? 0
                : compare(time(a), time(b)) || compare(a.str, b.str);
        }
        // the mongoose ObjectId lacks the same interface as the mock so we improvise here
        // @param {BsonObject} a - this in the in memory ObjectID with out .equals
        // @param {String|BsonObject} b - this is the hex ObjectID String sent to the route
        if (a.id) {
            const ahex = a.id.toString('hex').trim();
            const bhex = b.id ? b.id.toString('hex').trim() : b;
            return ahex == bhex ? 0 : 1;
        }
  return compare(a,b);
};
function time(id) {
  return id.getTimestamp().getTime()
}

module.exports = sift;
