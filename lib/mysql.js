"use strict";

var mysql = require("mysql");
var util = require("./util.js");
var co = require("co");

module.exports = {

  extract: (options) => {

    return co(function *(){

      var schemaOptions = JSON.parse(JSON.stringify(options));
      schemaOptions.database = "information_schema";
      var conn = mysql.createConnection(schemaOptions);
      conn.connect();

      var schema = {
        vendor: "mysql",
        database: options.database,
        tableCount: 0,
        tables: {},
      };

      //tables:
      var q = "select TABLE_NAME, TABLE_COMMENT, ENGINE from TABLES where TABLE_SCHEMA=?";
      var tablesResult = yield util.promisifyCall(conn.query, conn, [q, options.database]);
      schema.tableCount = tablesResult.length;

      tablesResult.forEach(row => {
        schema.tables[row["TABLE_NAME"]] = {
          name: row.TABLE_NAME,
          engine: row.ENGINE,
          pks: [],
          columnCount: 0,
          columns: {},
          indexes: {},
          foreignKeys: {},
        }

        if (row.TABLE_COMMENT !== '')
          schema.tables[row["TABLE_NAME"]].comment = row.TABLE_COMMENT;
      });

      //columns:
      q = "select * from COLUMNS where TABLE_SCHEMA=?";
      var columnRows = yield util.promisifyCall(conn.query, conn, [q, options.database]);

      columnRows.forEach(cr => {
        var table = schema.tables[cr.TABLE_NAME];
        table.columnCount++;
        table.columns[cr.COLUMN_NAME] = {
          name: cr.COLUMN_NAME,
          position: cr.ORDINAL_POSITION,
          default: cr.COLUMN_DEFAULT,
          nullable : cr.IS_NULLABLE !== 'NO',
          type: cr.COLUMN_TYPE,
        }

        //we created 2 columns that are unique together. we didn't set pk.
        //mysql reports both columns as primary keys. don't know how to fix this.
        if (cr.COLUMN_KEY === 'PRI') {
          table.pks.push(cr.COLUMN_NAME);
          table.columns[cr.COLUMN_NAME].isPK = true;
          table.columns[cr.COLUMN_NAME].isAI = cr.EXTRA === 'auto_increment';
        }

        if (cr.CHARACTER_MAXIMUM_LENGTH)
          table.columns[cr.COLUMN_NAME].lengthInChars = cr.CHARACTER_MAXIMUM_LENGTH;

        if (cr.CHARACTER_OCTET_LENGTH)
          table.columns[cr.COLUMN_NAME].lengthInBytes = cr.CHARACTER_OCTET_LENGTH;

        if (cr.COLUMN_COMMENT !== '')
          table.columns[cr.COLUMN_NAME].comment = cr.COLUMN_COMMENT;
      });

      //constraints:
      q = `select
      tc.CONSTRAINT_NAME, tc.TABLE_NAME, tc.CONSTRAINT_TYPE,
      rc.UPDATE_RULE, rc.DELETE_RULE, rc.REFERENCED_TABLE_NAME
      from TABLE_CONSTRAINTS tc
      left join REFERENTIAL_CONSTRAINTS rc
        on rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME and
           rc.TABLE_NAME = tc.TABLE_NAME
      where tc.CONSTRAINT_SCHEMA = ?`;

      var rows = yield util.promisifyCall(conn.query, conn, [q, options.database]);
      rows.forEach(r => {
        var table = schema.tables[r.TABLE_NAME];

        table.indexes[r.CONSTRAINT_NAME] = {
          name: r.CONSTRAINT_NAME,
          type: r.CONSTRAINT_TYPE,
          unique: r.CONSTRAINT_TYPE != 'FOREIGN KEY',
          columns: [],
        }

        if (r.CONSTRAINT_TYPE === 'FOREIGN KEY') {
          table.foreignKeys[r.CONSTRAINT_NAME] = {
            toTable: r.REFERENCED_TABLE_NAME,
            update: r.UPDATE_RULE,
            delete : r.DELETE_RULE,
            columns: [],
          }
        }
      });

      //key column usage:
      q = `select * from KEY_COLUMN_USAGE where CONSTRAINT_SCHEMA = ?`;
      var rows = yield util.promisifyCall(conn.query, conn, [q, options.database]);
      rows.forEach(r => {

        var table = schema.tables[r.TABLE_NAME];

        if (r.REFERENCED_TABLE_NAME != null) {
          table.foreignKeys[r.CONSTRAINT_NAME].columns.push({
            name: r.COLUMN_NAME,
            toColumn: r.REFERENCED_COLUMN_NAME,
          });
        }

        if (table.indexes[r.CONSTRAINT_NAME]) {
          table.indexes[r.CONSTRAINT_NAME].columns.push(r.COLUMN_NAME);
        }

      });

      //other indexes:
      q = `SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE
       FROM STATISTICS WHERE TABLE_SCHEMA = ? AND INDEX_NAME != 'PRIMARY'`;
      var rows = yield util.promisifyCall(conn.query, conn, [q, options.database]);
      for (var r of rows) {        
        if (!schema.tables[r.TABLE_NAME].indexes[r.INDEX_NAME])
        schema.tables[r.TABLE_NAME].indexes[r.INDEX_NAME] = {
          name: r.INDEX_NAME,
          type: 'INDEX',
          unique: r.NON_UNIQUE == 0,
          columns: [],
        }
        schema.tables[r.TABLE_NAME].indexes[r.INDEX_NAME].columns.push(r.COLUMN_NAME);
      }

      conn.end();
      return schema;
    });
  }
}
