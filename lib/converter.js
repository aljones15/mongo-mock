module.exports = convertBufferToHexString;

/**
    * convertBufferToHexString - turns a mongoose buffer into hex string
    * @param {Object} doc
    * @return {Object}
    */
  function convertBufferToHexString(doc){
    // no nulls or undefineds etc
    if (!doc) {
      return doc;
    }
    const total_keys = Object.keys(doc);
    // numbers, Symbols, and empty object just return them
    if (total_keys.length === 0) {
      return doc;
    }
    // strings can go infinite so check
    if (typeof doc === typeof 'string') {
      return doc;
    }
      // if we get an ObjectId just return it
      if (doc.id && doc.id.toString){
        doc = ObjectId(doc.id.toString('hex'));
        return doc;
      }
    for(let key in doc) {
      if (doc[key] && doc[key].id && doc[key].id.toString){
        doc[key] = ObjectId(doc[key].id.toString('hex'));
      } else {
        if (typeof doc[key] == typeof {} && doc[key]){
              if (Array.isArray(doc[key])){
                doc[key] = doc[key].map((d) => convertBufferToHexString(d));
              } else {
                convertBufferToHexString(doc[key]);
              }
        }
      }
    }
    return doc;
  }