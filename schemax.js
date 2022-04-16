"use strict";

/* options: {
  adapter: one of "mysql" / "mysql2" / "sqlite3" / "pg" | "postgres"
  host,
  user,
  password,
  database, //path if sqlite
}
*/

module.exports = {

  extract: options => {
    let adapterName = options.adapter;
    if (adapterName === 'pg') adapterName = 'postgres';
    const schemaxAdapter = require("./lib/" + adapterName);
    return schemaxAdapter.extract(options);
  }

}
