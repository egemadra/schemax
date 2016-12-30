"use strict";

/* options: {
  adapter: one of "mysql" / "sqlite3" / "pg" | "postgres"
  host,
  user,
  password,
  database, //path if sqlite
}
*/

module.exports = {

  extract: options => {
    var adapterName = options.adapter;
    if (adapterName === 'pg') adapterName = 'postgres';
    var schemaxAdapter = require("./lib/" + adapterName);
    return schemaxAdapter.extract(options);
  }

}
