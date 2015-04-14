var asyncish = require('../').asyncish;
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('mongo-mock:db');
var Collection = require('./collection.js');
var ObjectId = require('bson-objectid');
var _ = require('lodash');

var Db = module.exports = function(dbname, server) {
  var badguy = /[ .$\/\\]/.exec(dbname);
  if(badguy) throw new Error("database names cannot contain the character '" + badguy[0] + "'");

  var interface = {
    get databaseName() { return dbname; },
    addUser: NotImplemented,
    admin: NotImplemented,
    authenticate: NotImplemented,
    close: function(force, callback) {
      callback = arguments[arguments.length-1];
      if(typeof callback !== "function") callback = undefined;
      //else if(callback===force) force = false;

      interface.emit('close');
      interface.removeAllListeners('close');

      debug('closing %s', dbname);
      clearInterval(open);
      open = false;

      if(callback) callback();
    },
    collection: function(name, options, callback) {
      callback = arguments[arguments.length - 1];
      if(typeof callback !== 'function') callback = undefined;
      if(!options || callback===options) options = {};

      if(options.strict && !callback)
        throw Error("A callback is required in strict mode. While getting collection " + name);

      var collection = getCollection(name);

      if(options.strict && !collection.documents)
        return callback(Error("Collection "+name+" does not exist. Currently in strict mode."));

      if(callback) callback(null, collection);
      return collection;
    },
    collections: NotImplemented,
    command: NotImplemented,
    createCollection: function (name, options, callback) {
      if(!name) throw Error('name is mandatory');
      callback = arguments[arguments.length - 1];
      if(typeof callback !== 'function') callback = undefined;
      if(!options || callback===options) options = {};

      debug('createCollection("%s")', name);
      asyncish(function () {
        var collection = getCollection(name);
        if(collection.documents) {
          debug('createCollection("%s") - collection exists', name);
          if(options.strict)
            return callback && callback(new Error("Collection " + name + " already exists. Currently in strict mode."));
          return collection;
        }

        debug('createCollection("%s") - materializing collection', name);
        collection.persist(options.autoIndexId);
        if(callback) callback(null, collection);
      });
    },
    createIndex: function (name, keys, options, callback) {
      callback = arguments[arguments.length-1];
      if(typeof callback!=='function') callback = undefined;
      if(callback===options) options = {};
      if(typeof keys === 'string') keys = keyify(keys);

      debug('createIndex("%s", %j, %j)', name, keys, options);
      var ns = dbname+'.'+name;
      var index = _.find(indexes, {key:keys, ns:ns}) || (options.name && _.find(indexes, {name:options.name}));
      if(index) return callback && callback(null, index.name || options.name);//the behavior is to ignore if it exists

      index = _.extend({}, options);
      if(index.v && index.v!==1) throw new Error("`v` not supported");
      if(index.dropDups) throw new Error("`dropDups` not supported. PR welcome!");
      if(index.unique!==true && name !== '_id_') {
        console.log(index);
        throw new Error("only `unique` indexes are currently supported. PR welcome!");
      }
      if(!index.name)
        index.name = Object.keys(keys).map(function(k){return k+'_'+keys[k]}).join('_');
      index.v = 1;
      index.key = keys;
      index.ns = ns;

      interface.createCollection(name, {}, function (err, collection) {
        if(index.name !== '_id_' && !_.isEqual(keys, {_id:1}))
          indexes.push(index);
        collection.persist();
        if(callback) callback(null, index.name);
      });
    },
    db: NotImplemented,
    dropCollection: NotImplemented,
    dropDatabase: NotImplemented,
    ensureIndex: NotImplemented,
    eval: NotImplemented,
    executeDbAdminCommand: NotImplemented,
    indexInformation: function (name, options, callback) {
      callback = arguments[arguments.length-1];
      if(callback===options) options = {};
      if(!options.full) throw Error('only `options.full` is supported. PR welcome!');

      callback(null, _.where(indexes, { ns:dbname+'.'+name }));
    },
    listCollections: function(filter, options) {
      debug('listCollections(%j)', filter);
      return interface.collection(Db.SYSTEM_NAMESPACE_COLLECTION).find(filter);
    },
    logout: NotImplemented,
    open: function(callback) {
      if(open) return callback(null, interface);

      //keep the process running like a live connection would
      open = setInterval(function () {}, 600000);

      asyncish(function () {
        debug('%s open', dbname);
        callback(null, interface);
      });
    },
    removeUser: NotImplemented,
    renameCollection: NotImplemented,
    stats: NotImplemented,
    toJSON: function () {
      return backingstore;
    }
  };
  interface.__proto__ = EventEmitter.prototype;



  function getCollection(name) {
    var instance = _.find(backingstore.collections, {name:name} );
    if(instance) return instance;

    var state = new CollectionState(name);
    state.persist = function materialize(autoIndexId) {
      if(!state.documents) state.documents = [];
      if(autoIndexId !== false) {
        debug('%s persist() - creating _id index', name);
        indexes.push({ v:1, key:{_id:1}, ns:dbname+'.'+name, name:"_id_", unique:true });
      }
      //registering it in the namespaces makes it legit
      namespaces.push({ name:name });

      //now that it is materialized, remove this function
      delete state.persist;

      //call the prototype's version
      state.persist();
    };

    instance = Collection(interface, state);
    backingstore.collections.push(instance);
    return instance;
  }

  function CollectionState(name, documents, pk) {
    this.name = name;
    this.documents = documents;
    this.pkFactory = pk || ObjectId;
  }
  CollectionState.prototype = {
    persist: server.persist,
    findConflict: function (data) {
      var documents = this.documents;
      if(!documents) return;

      var ns = dbname+'.'+this.name;
      var idxs = _.where(indexes, {ns:ns});
      for (var i = 0; i < idxs.length; i++) {
        var index = idxs[i];
        var keys = Object.keys(index.key);
        var query = _.pick(data, keys);
        if(_.some(documents, query)) return indexError(index, i);
      }
    },
    toJSON: function () {
      if(!this.documents) return;
      return { name:this.name, documents:this.documents };
    }
  };

  function create_backingstore(db) {
    return {
      collections: [
        Collection(db, new CollectionState(Db.SYSTEM_NAMESPACE_COLLECTION, [{name:Db.SYSTEM_INDEX_COLLECTION}], noop)),
        Collection(db, new CollectionState(Db.SYSTEM_INDEX_COLLECTION, [], noop))
      ]
    };
  }


  var open = false;
  var backingstore = server.databases[dbname] || (server.databases[dbname] = create_backingstore(interface));
  var namespaces = getCollection(Db.SYSTEM_NAMESPACE_COLLECTION).toJSON().documents;
  var indexes = getCollection(Db.SYSTEM_INDEX_COLLECTION).toJSON().documents;
  return interface;
};
function noop(){}


function NotImplemented(){
  throw Error('Not Implemented. PR welcome!');
}
function indexError(index, i) {
  var err = new Error('E11000 duplicate key error index: ' + index.ns +'.$'+ index.name);
  err.name = 'MongoError';
  err.ok = 1;
  err.n = 1;
  err.code = 11000;
  err.errmsg = err.message;
  err.writeErrors = [{
    index: i,
    code: 11000,
    errmsg: err.message
  }];
  return err;
}
function keyify(key) {
  var out = {};
  out[key] = 1;
  return out;
}

// Constants
Db.SYSTEM_NAMESPACE_COLLECTION = "system.namespaces";
Db.SYSTEM_INDEX_COLLECTION = "system.indexes";
Db.SYSTEM_PROFILE_COLLECTION = "system.profile";
Db.SYSTEM_USER_COLLECTION = "system.users";