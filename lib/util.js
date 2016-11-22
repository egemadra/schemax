"use strict";

module.exports = {

  promisifyCall: function(fn, context, args) {
    if (args===undefined) args=[];

    return new Promise(function(resolve, reject){

      var cb=function(err,ret){
        if (err) return (reject(err))
        return resolve(ret);
      }

      args.push(cb);

      fn.apply(context, args);
    });
  },
}
