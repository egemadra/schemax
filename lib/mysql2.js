"use strict";

const mysql = require("mysql2/promise");

module.exports = {
  conn: null,

  async query (q, params) {
    const [rows, fields] = await this.conn.query(q, params);
    console.log("ixte paşam",rows);
    return rows;
  },

  async extract (options) {

    const schemaOptions = JSON.parse(JSON.stringify(options));
    schemaOptions.database = "information_schema";
    delete schemaOptions.adapter; //mysql2 doesn't like unused props.
    this.conn = await mysql.createConnection(schemaOptions);
    await this.conn.connect();

    const schema = {
      vendor: "mysql",
      adapter: "mysql2",
      database: options.database,
      tableCount: 0,
      tables: {},
    };

    //tables:
    let q = "select TABLE_NAME, TABLE_COMMENT, ENGINE from TABLES where TABLE_SCHEMA = ?";
    const tablesResult = await this.query(q, [options.database]);

    tablesResult.forEach(row => {
      schema.tables[row["TABLE_NAME"]] = {
        name: row.TABLE_NAME,
        engine: row.ENGINE,
        pks: [],
        columnCount: 0,
        columns: {},
        indexes: {},
        foreignKeys: {},
      };

      if (row.TABLE_COMMENT !== '')
        schema.tables[row["TABLE_NAME"]].comment = row.TABLE_COMMENT;
    });

    //columns:
    q = "select * from COLUMNS where TABLE_SCHEMA = ?";
    const columnRows = await this.query(q, [options.database]);

    columnRows.forEach(cr => {
      const table = schema.tables[cr.TABLE_NAME];
      table.columnCount++;
      table.columns[cr.COLUMN_NAME] = {
        name: cr.COLUMN_NAME,
        position: cr.ORDINAL_POSITION,
        default: cr.COLUMN_DEFAULT,
        nullable : cr.IS_NULLABLE !== 'NO',
        type: cr.COLUMN_TYPE,
      };

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
            rc.TABLE_NAME = tc.TABLE_NAME and
            rc.CONSTRAINT_SCHEMA = ?
      where tc.CONSTRAINT_SCHEMA = ?`;

    const constraintRows = await this.query(q, [options.database, options.database]);
    constraintRows.forEach(r => {
      const table = schema.tables[r.TABLE_NAME];

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
    const keyColRows = await this.query(q, [options.database]);
    keyColRows.forEach(r => {
      const table = schema.tables[r.TABLE_NAME];

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

    //other indices:
    q = `SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE
      FROM STATISTICS WHERE TABLE_SCHEMA = ? AND INDEX_NAME != 'PRIMARY'`;
    const otherIndices = await this.query(q, [options.database]);
    for (const r of otherIndices) {
      if (! schema.tables[r.TABLE_NAME].indexes[r.INDEX_NAME]) {
        schema.tables[r.TABLE_NAME].indexes[r.INDEX_NAME] = {
          name: r.INDEX_NAME,
          type: 'INDEX',
          unique: r.NON_UNIQUE == 0,
          columns: [],
        }
      }
      
      schema.tables[r.TABLE_NAME].indexes[r.INDEX_NAME].columns.push(r.COLUMN_NAME);
    }

    this.conn.end();
    this.conn = null;
    
    return schema;    
  }
}
