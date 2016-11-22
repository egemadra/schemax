"use strict";

var sqlite3 = require('sqlite3').verbose();
var util = require("./util.js");
var co = require("co");

module.exports = {

  extract: (options) => {

    return co(function *(){

      function connect() {
        var conn = null;
        return new Promise(function(resolve, reject){
          var cb=function(err){
            if (err) return reject(err);
            return resolve(conn);
          };
          conn = new sqlite3.Database(options.database, sqlite3.OPEN_READONLY, cb);
        });
      }

      var conn = yield connect();
      var schema = {
        vendor: "sqlite3",
        database: options.database,
        tableCount: 0,
        tables: {},
      };

      //tables:
      var q = "SELECT name FROM sqlite_master WHERE type='table'";
      var tableList = yield util.promisifyCall(conn.all, conn, [q]);
      schema.tableCount = tableList.length - 1; //don't count sqlite_seq
      for (var t of tableList) {
        if (t.name === 'sqlite_sequence') continue;
        schema.tables[t.name] = {
          name: t.name,
          pks: [],
          columnCount: 0,
          columns: {},
          indexes: {}, //by index name
          foreignKeys: {}, //by id of foreign key list.
        }

        var escapedTableName = t.name.replace(/\"/g, '""');
        var table = schema.tables[t.name];

        //columns:
        var q = 'PRAGMA table_info("' + escapedTableName + '")';
        var columnRows = yield util.promisifyCall(conn.all, conn, [q]);
        table.columnCount = columnRows.length;

        for (var cr of columnRows) {
          table.columns[cr.name] = {
            name: cr.name,
            position: cr.cid,
            default: cr.dflt_value ? cr.dflt_value.substr(1, cr.dflt_value.length -2) : null,
            nullable : !!!cr.notnull,
            type: cr.type,
          }

          if (cr.pk) {
            table.pks.push(cr.name);
            table.columns[cr.name].isPK = true;
            //integer pks are always auto inc: https://sqlite.org/faq.html#q1
            table.columns[cr.name].isAI = cr.pk === 1 && cr.type === 'integer';
          }
        }

        //foreign keys:
        q = 'PRAGMA foreign_key_list("' + escapedTableName + '")';
        var fkRows = yield util.promisifyCall(conn.all, conn, [q]);
        for (var cr of fkRows) {
          if (!table.foreignKeys[cr.id]) table.foreignKeys[cr.id] = {
            toTable: cr.table,
            update: cr.on_update,
            delete: cr.on_delete,
            columns: [],
          };

          table.foreignKeys[cr.id].columns.push({
            name: cr.from,
            toColumn: cr.to,
          });
        }

        //constraints:
        q = 'PRAGMA index_list("' + escapedTableName + '")';
        var indexes = yield util.promisifyCall(conn.all, conn, [q]);
        for (var i of indexes) {

          var type = i.origin === 'pk' ? "PRIMARY KEY" : null;
          if (!type) type = !!i.unique ? "UNIQUE" : "INDEX";

          if (!table.indexes[i.name]) table.indexes[i.name] = {
            name: i.name,
            type: type,
            unique: !!i.unique,
            columns: [],
          };

          var iq = 'PRAGMA index_info("' + i.name + '")';
          var ir = yield util.promisifyCall(conn.all, conn, [iq]);
          for (var ic of ir)
            table.indexes[i.name].columns.push(ic.name);
        }
      }

      return schema;
    });
  }
}
