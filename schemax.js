"use strict";

/* options: {
  adapter: one of "mysql" / "sqlite3" / "pg"
  host,
  user,
  password,
  database, //path if sqlite
}
*/

module.exports = {

  extract: options => {
    var schemaxAdapter = require("./lib/" + options.adapter);
    return schemaxAdapter.extract(options);
  }

}
